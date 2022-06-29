/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import {DEAD, ONE_HUNDRED_PERCENT, ROLE_PAUSER, ROLE_BONDS, ROLE_ORACLE, ROLE_NFCS} from "../Globals.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "../libraries/Loan.sol";
import {NFCSInterface} from "../NFCS/NFCSInterface.sol";
import {ScoreDBInterface} from "../interfaces/ScoreDBInterface.sol";
import {IERC20PaymentStandard} from "../interfaces/newInterfaces/payment/IERC20PaymentStandard.sol";
import {Version} from "../Version/Version.sol";
import {Errors} from "../libraries/Errors.sol";
import "../utilities/AddressHandler.sol";

/**
 * @title ERC20PaymentStandard
 * @author RociFI Labs
 */
abstract contract ERC20PaymentStandard is IERC20PaymentStandard, AddressHandler, Pausable, Version {
    using SafeERC20 for IERC20Metadata;
    // Two mappings. One to get the loans for a user. And the other to get the the loans based off id

    mapping(uint256 => Loan.loan) internal _loanLookup;
    // note 0x0 maps to the contract global for all loans
    mapping(address => Loan.globalInfo) internal globalLoanLookup;

    mapping(uint256 => Loan.globalInfo) internal nfcsLoanLookup;

    mapping(address => uint256[]) public loanIDs;

    uint256 public override MAXIMUM_BORROW_LIMIT;

    // Events
    event LoanRepaid(
        uint256 timestamp,
        address indexed borrower,
        address indexed repayer,
        uint256 indexed loanId,
        uint256 principal,
        uint256 amountRepaid,
        Loan.Status status
    );

    constructor(IAddressBook _addressBook) AddressHandler(_addressBook) {}

    /// @notice requires contract is not paid off
    modifier incomplete(uint256 _id) {
        require(!isComplete(_id), Errors.PAYMENT_FULFILLED);
        _;
    }

    function loanLookup(uint256 _id) external view override returns (Loan.loan memory) {
        return _loanLookup[_id];
    }

    /**
     * @notice called when bonds are issued so as to make sure lender can only mint bonds once.
     * @param _id loan ID
     * @return the loan principal (so bonds knows how many NFTs to mint)
     * @return the borrowers address (so bonds can make sure borrower is calling this function)
     */
    function issueBonds(uint256 _id)
        public
        virtual
        override
        whenNotPaused
        onlyRole(ROLE_BONDS)
        returns (uint256, address)
    {
        Loan.loan storage ln = _loanLookup[_id];
        uint256 NFCSID = ln.nfcsID;
        Loan.issue(
            ln,
            globalLoanLookup[ln.borrower],
            globalLoanLookup[address(0)],
            nfcsLoanLookup[NFCSID]
        );
        _afterLoanChange(ln, _id);

        NFCSInterface nfcs = NFCSInterface(lookup(ROLE_NFCS));
        (
            uint128 dailyLimit,
            uint128 globalLimit,
            uint128 userDailyLimit,
            uint128 userGlobalLimit
        ) = nfcs.getLimits();
        (, uint128 nfcsGlobalLimit) = nfcs.getNFCSLimits(NFCSID);
        (uint256 gloablOutstanding, uint256 userOutstanding, uint256 nfcsOutstanding) = nfcs
            .getTotalOutstanding(NFCSID);
        // preform the check on daily and global limit with the total outstanding balance looked up
        Loan.limitDailyCheck(
            ln,
            globalLoanLookup[ln.borrower],
            userDailyLimit,
            Errors.LOAN_DAILY_LIMIT_USER
        );
        if (nfcsGlobalLimit != 0) {
            Loan.limitGlobalCheck(nfcsOutstanding, nfcsGlobalLimit, Errors.LOAN_TOTAL_LIMIT_NFCS);
        } else {
            Loan.limitGlobalCheck(userOutstanding, userGlobalLimit, Errors.LOAN_TOTAL_LIMIT_USER);
        }

        Loan.limitDailyCheck(ln, globalLoanLookup[address(0)], dailyLimit, Errors.LOAN_DAILY_LIMIT);
        Loan.limitGlobalCheck(gloablOutstanding, globalLimit, Errors.LOAN_TOTAL_LIMIT);
        return (ln.principal, ln.borrower);
    }

    /**
     * @notice gets the number of loans a person has
     * @param _who is who to look up
     * @return length
     */
    function getNumberOfLoans(address _who) external view virtual override returns (uint256) {
        return loanIDs[_who].length;
    }

    /**
     * @notice Called each time new NFTs are minted by staking
     * @param _am the amount of interest to add
     * @param _id is the id of the loan
     * @return true if added. Will not add interest if payment has been completed.
     *This prevents lenders from refusing to end a loan when it is rightfully over by forever
     *increasing the totalPaymentsValue through interest staking and never fully collecting payment.
     *This also means that if lenders do not realize interest gains soon enough they may not be able to collect them before
     *the borrower can complete the loan.
     */
    function addInterest(uint256 _am, uint256 _id)
        external
        virtual
        override
        whenNotPaused
        onlyRole(ROLE_BONDS)
        returns (bool)
    {
        if (!isComplete(_id)) {
            Loan.increaseTotalPaymentsValue(
                _loanLookup[_id],
                globalLoanLookup[_loanLookup[_id].borrower],
                globalLoanLookup[address(0)],
                nfcsLoanLookup[_loanLookup[_id].nfcsID],
                _am,
                addressBook.penaltyAPYMultiplier()
            );
            _afterLoanChange(_loanLookup[_id], _id);
            return true;
        } else {
            return false;
        }
    }

    /**
     * @param _id is the hash id of the loan. Same as bond ERC1155 ID as well
     * @return if delinquent or not. Meaning missed a payment
     */
    function missedPayment(uint256 _id) public view virtual override returns (bool) {
        return (_isLate(_id) &&
            block.timestamp >= _loanLookup[_id].maturityDate + addressBook.gracePeriod());
    }

    /**
     * @notice contract must be configured before bonds are issued. Pushes new loan to array for user
     * @dev borrower is msg.sender for testing. In production might want to make this a param
     * @param _erc20 is the ERC20 contract address that will be used for payments
     * @param _borrower is the borrower loan is being configured for. Keep in mind. ONLY this borrower can mint bonds to start the loan
     * @param _NFCSID is the user's NFCS NFT ID from Roci's Credit scoring system
     * @param _minPayment is the minimum payment that must be made before the payment period ends
     * @param _maturityDate payment must be made by this time or delinquent function will return true
     * @param _principal the origional loan value before interest
     * @param _interestRate the interest rate expressed as inverse. 2% = 1/5 = inverse of 5
     * @param _accrualPeriod the time it takes for interest to accrue in seconds
     * @return the id it just created
     */
    function configureNew(
        address _erc20,
        address _borrower,
        uint256 _minPayment,
        uint256 _NFCSID,
        uint256 _maturityDate,
        uint256 _principal,
        uint256 _interestRate,
        uint256 _accrualPeriod
    ) external virtual override whenNotPaused returns (uint256) {
        require(
            IERC721(lookup(ROLE_NFCS)).ownerOf(_NFCSID) == _borrower,
            Errors.PAYMENT_NFCS_OWNERSHIP
        );
        //Create new ID for the loan
        uint256 id = getId(_borrower, loanIDs[_borrower].length);
        //Push to loan IDs
        loanIDs[_borrower].push(id);
        // Grab LTV and LT for this tokenId's score
        ScoreDBInterface oracle = ScoreDBInterface(lookup(ROLE_ORACLE));
        uint16 score = oracle.getScore(_NFCSID).creditScore;
        uint256 LTV = oracle.LTV(_erc20, score);
        uint256 LT = oracle.LT(_erc20, score);

        //Add loan info to lookup
        _loanLookup[id] = Loan.loan({
            status: Loan.Status.NEW,
            ERC20Address: _erc20,
            borrower: _borrower,
            nfcsID: _NFCSID,
            maturityDate: _maturityDate,
            issueDate: 0,
            minPayment: _minPayment,
            interestRate: _interestRate,
            accrualPeriod: _accrualPeriod,
            principal: _principal,
            totalPaymentsValue: _principal, //For now. Will update with interest updates
            awaitingCollection: 0,
            awaitingInterest: 0,
            paymentComplete: 0,
            ltv: LTV,
            lt: LT,
            score: score,
            poolAddress: msg.sender
        });
        _afterLoanChange(_loanLookup[id], id);
        return id;
    }

    /**
     * @notice MUST approve this contract to spend your ERC1155s in bonds. Used to have this auto handled by the on received function.
     * However that was not a good idea as a hacker could create fake bonds.
     * @param _id is the id of the bond to send in
     * @param _am is the amount to send
     * @param _receiver is the receiver of erc20 tokens
     */
    function withdrawl(
        uint256 _id,
        uint256 _am,
        address _receiver
    ) external virtual override whenNotPaused {
        uint256 awaitingCollectionBeforeChange = _loanLookup[_id].awaitingCollection;
        Loan.loan storage ln = _loanLookup[_id];
        Loan.onWithdrawal(ln, _am);
        _afterLoanChange(ln, _id);
        IERC1155 Bonds = IERC1155(lookup(ROLE_BONDS));
        IERC20Metadata erc20 = IERC20Metadata(_loanLookup[_id].ERC20Address);
        require(_loanLookup[_id].status != Loan.Status.UNISSUED, Errors.PAYMENT_NON_ISSUED_LOAN);
        require(_am <= awaitingCollectionBeforeChange, Errors.PAYMENT_WITHDRAWAL_COLLECTION);
        Bonds.safeTransferFrom(_receiver, DEAD, _id, _am, "");
        erc20.safeTransfer(_receiver, _am);
    }

    /**
     * @notice function handles the payment of the loan. Does not have to be borrower
     *as payment comes in. The contract holds it until collection by bond owners. MUST APPROVE FIRST in ERC20 contract first
     * @param _id to pay off
     * @param _erc20Amount is amount in loan's ERC20 to pay
     */
    function payment(
        uint256 _id,
        uint256 _erc20Amount,
        string memory version
    ) external virtual override whenNotPaused checkVersion(version) incomplete(_id) {
        Loan.loan storage ln = _loanLookup[_id];

        require(_erc20Amount <= ln.totalPaymentsValue, Errors.PAYMENT_AMOUNT_TOO_LARGE);

        Loan.onPayment(
            ln,
            globalLoanLookup[_loanLookup[_id].borrower],
            globalLoanLookup[address(0)],
            nfcsLoanLookup[_loanLookup[_id].nfcsID],
            _erc20Amount
        );
        _afterLoanChange(ln, _id);

        IERC20Metadata(ln.ERC20Address).safeTransferFrom(msg.sender, address(this), _erc20Amount);

        emit LoanRepaid(
            block.timestamp,
            _loanLookup[_id].borrower,
            msg.sender,
            _id,
            _loanLookup[_id].principal,
            _erc20Amount,
            _loanLookup[_id].status
        );
    }

    /**
     * @notice helper function
     * @param _id of loan to check
     * @return return if the contract is payed off or not as bool
     */
    function isComplete(uint256 _id) public view virtual override returns (bool) {
        return Loan.isComplete(_loanLookup[_id]);
    }

    /**
     * @notice Returns the ID for a loan given the borrower and index in the array
     * @param _borrower is borrower
     * @param _index is the index in the borrowers loan array
     * @return the loan ID
     */
    //
    function getId(address _borrower, uint256 _index)
        public
        view
        virtual
        override
        returns (uint256)
    {
        uint256 id = uint256(keccak256(abi.encodePacked(address(this), _borrower, _index)));
        return id;
    }

    function getGlobalDailyBorrowedAmount() public view returns (uint128) {
        return globalLoanLookup[address(0)].borrowedToday;
    }

    /**
     * @notice Returns borrowed daily amount for user
     * @param _borrower address
     * @return borrowedAmount
     */
    //
    function getUserDailyBorrowedAmount(address _borrower) public view returns (uint128) {
        Loan.globalInfo memory user = globalLoanLookup[address(_borrower)];
        if ((block.timestamp - user.lastBorrowTimestamp) >= ONE_DAY) {
            return 0;
        }
        return user.borrowedToday;
    }

    /**
     * @dev this is a function to return if a loan is late on payments
     * @param _id is the loan id
     * @return true or false
     */
    function _isLate(uint256 _id) internal view virtual returns (bool) {
        return (Loan.isLate(_loanLookup[_id]) && !isComplete(_id));
    }

    /**
     * @dev function hook to execute every time a loan is changed
     */
    function _afterLoanChange(Loan.loan memory _ln, uint256 _id) internal virtual {}

    function pause() public onlyRole(ROLE_PAUSER) {
        _pause();
    }

    function unpause() public onlyRole(ROLE_PAUSER) {
        _unpause();
    }
}
