// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "../interfaces/newInterfaces/payment/IRociPayment.sol";
import "../interfaces/newInterfaces/investor/Iinvestor.sol";
import "../interfaces/IBonds.sol";
import "../utilities/AddressHandler.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ONE_HUNDRED_PERCENT, ONE_HOUR, ROLE_PAUSER, ROLE_BONDS, ROLE_PAYMENT_CONTRACT, ROLE_ADMIN} from "../Globals.sol";
import {IAddressBook} from "../interfaces/IAddressBook.sol";
import {Version} from "../Version/Version.sol";
import {Errors} from "../libraries/Errors.sol";

/**
 * @title Investor
 * @author RociFI Labs
 */
abstract contract Investor is Iinvestor, ERC1155Holder, AddressHandler, Pausable, Version {
    using SafeERC20 for IERC20Metadata;

    uint256 public override interestRateAnnual = 10 ether;

    /// NOTE token is not upgradeable through address book.
    IERC20Metadata public token;

    // pool operation limits
    LimitInfo public limits;

    // map loan ids to staking indexes
    mapping(uint256 => uint256) stakingIndexes;

    uint16[] public allowedScores;

    // Events
    event BorrowSuccessful(
        uint256 timestamp,
        address indexed borrower,
        uint256 indexed loanId,
        uint256 indexed amount,
        uint256 duration,
        address collateralToken,
        uint256 collateralAmount,
        uint256 ltv,
        uint256 lt,
        uint256 interestRateAnnual,
        uint256 accrualPeriod
    );

    struct LimitInfo {
        uint256 totalValue;
        uint128 valueToday;
        uint128 lastTxTimestamp;
        uint128 currentDayTimestamp;
    }

    constructor(IAddressBook _addressBook, IERC20Metadata _token) AddressHandler(_addressBook) {
        token = _token;
    }

    function setAllowedScores(uint16[] memory scores) external onlyRole(ROLE_ADMIN) {
        allowedScores = scores;
    }

    /**
     * @dev function to combine the entire borrowing process in one function.
     *   1). configure
     *   2). mint
     *   3). exchange
     *
     * NOTE: the user will need to sign with the address of this and the ID of the loan. This is how they get their
     *   new loan's id before calling:
     *       id = getId(_borrower, getNumberOfLoans(address _borrower));
     *
     * @param args is an object of all the params for borrowing
     */
    function borrow(Structs.BorrowArgs calldata args, string memory version)
        external
        override
        whenNotPaused
        checkVersion(version)
    {
        IBonds bonds = IBonds(lookup(ROLE_BONDS));
        IRociPayment paymentc = IRociPayment(lookup(ROLE_PAYMENT_CONTRACT));

        require(
            paymentc.isScoreValidForBorrow(msg.sender, args._NFCSID, allowedScores),
            Errors.INVESTOR_BORROW_WITH_ANOTHER_SCORE
        );

        // set up loan config here
        _checkAvailable(args._amount);
        uint256 accrualPeriod = ONE_HOUR;
        uint256 periodsInYear = 365 * 24; // This is imprecise, so in leap year APR will be slightly bigger
        uint256 id = paymentc.configureNew(
            address(token),
            msg.sender,
            0,
            args._NFCSID,
            addressBook.getMaturityDate(),
            args._amount,
            interestRateAnnual / periodsInYear,
            accrualPeriod
        );

        // collect collateral
        /// NOTE borrower must approve the Collateral Manager to spend these funds NOT the investor
        if (args._collateralAmount > 0) {
            paymentc.addCollateral(msg.sender, args._collateral, args._collateralAmount);
        }

        // begin fulfilling the loan
        // this function calls the issue function which requires non-delinquency
        bonds.newLoan(lookup(ROLE_PAYMENT_CONTRACT), id, args._hash, args._signature);

        require(bonds.balanceOf(address(this), id) == args._amount, Errors.INVESTOR_ISSUE_BONDS);

        // stake the bonds to start collecting interest
        stakingIndexes[id] = bonds.stake(id, args._amount);

        // fulfill loan to borrower of loan
        _sendFunds(msg.sender, args._amount);
        // Event
        emit BorrowSuccessful(
            block.timestamp,
            paymentc.loanLookup(id).borrower,
            id,
            paymentc.loanLookup(id).principal,
            paymentc.loanLookup(id).maturityDate,
            args._collateral,
            args._collateralAmount,
            paymentc.loanLookup(id).ltv,
            paymentc.loanLookup(id).lt,
            interestRateAnnual,
            paymentc.loanLookup(id).accrualPeriod
        );
    }

    /**
     * @dev function to send funds to borrowers. Used to fulfill loans
     * @param _receiver is the receiver of the funds
     * @param _amount is the amount to send
     * NOTE this is meant to be overriden in order to contain logic for storing funds in other contracts
     */
    function _sendFunds(address _receiver, uint256 _amount) internal virtual {
        token.safeTransfer(_receiver, _amount);
    }

    /**
     * @dev function helps check to make sure a loan is available before it's fulfilled
     *   thus saving the user the gas of a failed fullfilment
     */
    function _checkAvailable(uint256 _amount) internal virtual {
        require(_amount > 0, "Cannot borrow an amount of 0");
        // check the oracle is not paused if pause functionality is added
    }

    function pause() public onlyRole(ROLE_PAUSER) {
        _pause();
    }

    function unpause() public onlyRole(ROLE_PAUSER) {
        _unpause();
    }
}
