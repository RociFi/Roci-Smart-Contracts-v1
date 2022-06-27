/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import {ONE_HUNDRED_PERCENT, CONTRACT_DECIMALS, ROLE_PRICE_FEED, ROLE_COLLATERAL_MANAGER} from "../Globals.sol";
import {ScoreDBInterface} from "../interfaces/ScoreDBInterface.sol";

import "./ERC20PaymentStandard.sol";
import "../interfaces/IPriceFeed.sol";
import "../interfaces/IBonds.sol";
import "../interfaces/newInterfaces/managers/ICollateralManager.sol";
import "../interfaces/newInterfaces/investor/IpoolInvestor.sol";
import "../libraries/Structs.sol";
import "../libraries/Tracker.sol";
import "../Version/Version.sol";
import {Errors} from "../libraries/Errors.sol";

import {IERC20CollateralPayment} from "../interfaces/newInterfaces/payment/IERC20CollateralPayment.sol";

/**
 * @title ERC20CollateralPayment
 * @author RociFI Labs
 */
abstract contract ERC20CollateralPayment is IERC20CollateralPayment, Version, ERC20PaymentStandard {
    using Tracker for Tracker.outstandings;
    using Loan for Loan.loan;
    // Collateral objects contain a mapping of each token and it's outstandin amount
    // All tokens and their amounts deposited as collateral by the user
    mapping(address => Tracker.outstandings) internal usersCollateral;

    mapping(address => uint256[]) internal usersActiveLoans;

    // Events
    event CollateralDeposited(
        uint256 timestamp,
        address indexed borrower,
        address indexed token,
        uint256 indexed amount
    );
    event CollateralWithdrawn(
        uint256 timestamp,
        address indexed borrower,
        address indexed token,
        uint256 indexed amount
    );

    constructor(address _addressBook) ERC20PaymentStandard(IAddressBook(_addressBook)) {}

    function collateralManager() private view returns (ICollateralManager) {
        return ICollateralManager(lookup(ROLE_COLLATERAL_MANAGER));
    }

    /**
     * @notice addCollateral must be called before issuing loan
     * @param _ERC20Contract address of the ERC20 you want to have as collateral. Doesn't have to be equal to payment ERC20
     * @param _amount is the amount to add as collateral
     */
    function addCollateral(
        address _from,
        address _ERC20Contract,
        uint256 _amount
    ) external virtual override whenNotPaused {
        collateralManager().deposit(_from, _ERC20Contract, _amount);
        emit CollateralDeposited(block.timestamp, _from, _ERC20Contract, _amount);
    }

    /**
     * @notice called when bonds are issued so as to make sure lender can only mint bonds once.
     * @param _id loan ID
     * @return principal (so bonds knows how many NFTs to mint)
     * @return borrower address (so bonds can make sure borrower is calling this function)
     */
    function issueBonds(uint256 _id)
        public
        virtual
        override(IERC20PaymentStandard, ERC20PaymentStandard)
        whenNotPaused
        onlyRole(ROLE_BONDS)
        returns (uint256 principal, address borrower)
    {
        Loan.loan memory ln = _loanLookup[_id];
        usersCollateral[ln.borrower].updateCollateral(ln);

        (principal, borrower) = super.issueBonds(_id);
        ScoreDBInterface oracle = ScoreDBInterface(lookup(ROLE_ORACLE));
        Structs.Score memory score = oracle.getScore(ln.nfcsID);
        require(
            block.timestamp >= score.timestamp &&
                block.timestamp - score.timestamp <= addressBook.scoreValidityPeriod(),
            Errors.PAYMENT_NFCS_OUTDATED
        );
        (uint256 collateral, uint256 collateralLTV, ) = getCollateralLTVandLTAbsoluteValues(
            borrower
        );
        require(
            collateralLTV != 0 && collateral >= collateralLTV,
            Errors.PAYMENT_NOT_ENOUGH_COLLATERAL
        );
    }

    function getCollateralData(address user)
        public
        view
        returns (
            uint256,
            uint8,
            uint256,
            uint8
        )
    {
        (address collateralContract, uint256 collateral) = collateralManager().getCollateralLookup(
            address(this),
            user
        );

        (uint256 collateralPrice, uint8 feederDecimalsCollateral) = _safeGetPriceOf(
            collateralContract
        );

        return (
            collateral,
            IERC20Metadata(collateralContract).decimals(),
            collateralPrice,
            feederDecimalsCollateral
        );
    }

    /*
     * @notice function for user to claim their collateral as they go. Must be within their LTV
     * @param _id
     * @param _amount to withdrawal
     */
    function claimCollateral(
        address _token,
        uint256 _amount,
        string memory version
    ) external override checkVersion(version) whenNotPaused {
        require(getBalanceOfCollateral(msg.sender) >= _amount, Errors.PAYMENT_CLAIM_COLLATERAL);
        collateralManager().withdrawal(msg.sender, _amount, msg.sender);
        // Now check if after withdrawaing this amount of collateral, any loan became delinquent, according to its LT
        // For each loan of the borrower across the entire protocol...
        for (uint256 i = 0; i < usersActiveLoans[msg.sender].length; i++) {
            require(
                !missedPayment(usersActiveLoans[msg.sender][i]),
                Errors.PAYMENT_CLAIM_COLLATERAL
            );
        }
        emit CollateralWithdrawn(block.timestamp, msg.sender, _token, _amount);
    }

    /// @dev returns the max amount of collateral that a borrower can withdraw, without making any of the borrower's loans delinquent.
    function getMaxWithdrawableCollateral() public view override whenNotPaused returns (uint256) {
        return getBalanceOfCollateral(msg.sender);
    }

    function getBalanceOfCollateral(address user) internal view whenNotPaused returns (uint256) {
        (uint256 collateral, uint256 collateralLTV, ) = getCollateralLTVandLTAbsoluteValues(user);

        if (collateralLTV != 0) {
            return collateralLTV <= collateral ? collateral - collateralLTV : 0;
        }

        return collateral;
    }

    function calculateCollateralFromOutStanding(uint256 outstandingUSD, uint256 parameter)
        internal
        pure
        returns (uint256)
    {
        return parameter == 0 ? uint256(0) : (outstandingUSD * ONE_HUNDRED_PERCENT) / parameter;
    }

    function getCollateralLTVandLTAbsoluteValues(address user)
        internal
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        (uint256 outstandingUSD, uint256 ltvMean, uint256 ltMean, ) = aggregateActiveLoansData(
            user
        );

        (
            uint256 collateral,
            uint8 collateralDecimals,
            uint256 feedPrice,
            uint8 feedDecimals
        ) = getCollateralData(user);

        uint256 collateralLTV = fromFeedPriceToToken(
            calculateCollateralFromOutStanding(outstandingUSD, ltvMean),
            collateralDecimals,
            CONTRACT_DECIMALS,
            feedPrice,
            feedDecimals
        );

        uint256 collateralLT = fromFeedPriceToToken(
            calculateCollateralFromOutStanding(outstandingUSD, ltMean),
            collateralDecimals,
            CONTRACT_DECIMALS,
            feedPrice,
            feedDecimals
        );

        return (collateral, collateralLTV, collateralLT);
    }

    /**
     * @notice override isDelinquent to factor in LTV
     * @dev returns false if the user has missed any repayments OR outstanding balance / collateral is >= LTV for the user at the time of calling
     * @param _id is the loan id
     * @return a bool representing if the loan does not have sufficient collateral OR has missed payments
     */
    function isDelinquent(uint256 _id) public view override returns (bool) {
        // This isDelinquent checks if loan is then if is undercoll then check it missed payment else check it can liquidate by LT

        if (missedPayment(_id)) {
            return true;
        }

        if (_loanLookup[_id].lt < ONE_HUNDRED_PERCENT) {
            (uint256 collateral, , uint256 collateralLT) = getCollateralLTVandLTAbsoluteValues(
                _loanLookup[_id].borrower
            );
            return collateralLT == 0 ? false : collateral <= collateralLT;
        }
        return false;
    }

    /**
     * @dev gets data for all active loans of borrower
     * @param user address of borrower
     * @return int256 outstanding value in USD
     * @return uint256 mean LTV value
     * @return uint256 mean LT value
     */
    // TODO: add support for getting price of different tokens
    function aggregateActiveLoansData(address user)
        internal
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        uint256[] memory activeLoans = usersActiveLoans[user];
        uint256 outstandingUSD;
        uint256 ltvAggregatedMean;
        uint256 ltAggregatedMean;
        uint256 tpvAggregatedMean;

        if (activeLoans.length > 0) {
            address erc20Address = _loanLookup[activeLoans[0]].ERC20Address;

            for (uint256 i = 0; i < activeLoans.length; i++) {
                Loan.loan memory loan = _loanLookup[activeLoans[i]];
                outstandingUSD += loan.getOutstanding();
                ltvAggregatedMean += loan.ltv;
                ltAggregatedMean += loan.lt;
                tpvAggregatedMean += loan.totalPaymentsValue;
            }

            (uint256 priceLoan, uint8 feederDecimalsLoan) = _safeGetPriceOf(erc20Address);

            outstandingUSD = fromTokenToFeedPrice(
                outstandingUSD,
                IERC20Metadata(erc20Address).decimals(),
                CONTRACT_DECIMALS,
                priceLoan,
                feederDecimalsLoan
            );

            ltvAggregatedMean /= activeLoans.length;
            ltAggregatedMean /= activeLoans.length;
            tpvAggregatedMean /= activeLoans.length;
        }
        return (outstandingUSD, ltvAggregatedMean, ltAggregatedMean, tpvAggregatedMean);
    }

    /**
     * @dev converts from token value to price feed value
     * @param value native value of token
     * @param collDecimals decimals of token price of we feeding
     * @param assetDecimals decimals of token that value needs convert to
     * @param price price of token from priceFeed
     * @return uint256 price feed value
     */
    function fromTokenToFeedPrice(
        uint256 value,
        uint8 collDecimals,
        uint8 assetDecimals,
        uint256 price,
        uint8 feedDecimals
    ) internal pure returns (uint256) {
        uint256 converted = (price * value) / (10**feedDecimals);

        int8 decimalsDiff = int8(assetDecimals) - int8(collDecimals);

        if (decimalsDiff < 0) {
            converted /= 10**uint8(-decimalsDiff);
        } else if (decimalsDiff > 0) {
            converted *= 10**uint8(decimalsDiff);
        }

        return converted;
    }

    /**
     * @dev converts from token value to price feed value
     * @param value native value of token
     * @param collDecimals decimals of token price of we feeding
     * @param assetDecimals decimals of token that value needs convert from
     * @param price price of token from priceFeed
     * @return uint256 price feed value
     */
    function fromFeedPriceToToken(
        uint256 value,
        uint8 collDecimals,
        uint8 assetDecimals,
        uint256 price,
        uint8 feedDecimals
    ) internal pure returns (uint256) {
        uint256 converted = (value * (10**feedDecimals)) / price;

        int8 decimalsDiff = int8(assetDecimals) - int8(collDecimals);

        if (decimalsDiff > 0) {
            converted /= 10**uint8(decimalsDiff);
        } else if (decimalsDiff < 0) {
            converted *= 10**uint8(-decimalsDiff);
        }

        return converted;
    }

    /**
     * @dev sometimes the priceFeed errors when looking up a token that ins't registered in the price feed.
     * Sometimes it shouldn't revert, instead we just have it return 0
     */
    function _safeGetPriceOf(address _tokenToGetPrice)
        internal
        view
        returns (uint256 tempPrice, uint8 decimals)
    {
        IPriceFeed priceFeedc = IPriceFeed(lookup(ROLE_PRICE_FEED));
        //If price less than zero of feeder not found it will be reverted inside
        return priceFeedc.getLatestPriceUSD(_tokenToGetPrice);
    }

    /**
     * @dev function liquidates deliquient loan and transfer collateral to _receiver
     * @param _id is id of the loan that need to be liquidated
     * @param _receiver collateral receiver
     */
    function liquidateLoan(uint256 _id, address _receiver) internal virtual {
        require(
            isDelinquent(_id),
            string(
                abi.encodePacked(
                    Errors.PAYMENT_LOAN_NOT_DELINQUENT,
                    " ",
                    Strings.toHexString(_id, 32)
                )
            )
        );
        address cAddress; //collateral address
        uint256 cAvailable; //user available collateral
        uint256 cToLiquidate; //collateral to liquidate
        uint256 cPrice; //collateral price in asset weis
        uint8 pDecimals; //data(price) feeder decimals
        bool def = false; // true if loan is default
        IpoolInvestor pool; //pool that pollValue need to be tweaked

        Loan.loan storage lInfo = _loanLookup[_id]; //loan info

        pool = IpoolInvestor(lInfo.poolAddress);

        (cAddress, cAvailable) = collateralManager().getCollateralLookup(
            address(this),
            lInfo.borrower
        );

        (cPrice, pDecimals) = _safeGetPriceOf(cAddress);

        //Normalization to collateral contract `format`
        cToLiquidate = fromFeedPriceToToken(
            lInfo.totalPaymentsValue - lInfo.paymentComplete,
            IERC20Metadata(cAddress).decimals(),
            IERC20Metadata(lInfo.ERC20Address).decimals(),
            cPrice,
            pDecimals
        );

        //If there is not enough collateral then take it all
        if (cToLiquidate > cAvailable) {
            def = true;
            cToLiquidate = cAvailable;
        }

        Loan.onLiquidate(lInfo, def);

        pool.liquidate(_id);

        if (cToLiquidate > 0) {
            collateralManager().withdrawal(lInfo.borrower, cToLiquidate, _receiver);
        }
    }

    /**
     * @dev function hook to execute every time a loan is changed
     */
    function _afterLoanChange(Loan.loan memory _ln, uint256 _id) internal virtual override {
        if (_ln.status != Loan.Status.UNISSUED) {
            usersCollateral[_ln.borrower].updateCollateral(_ln);
        }
        // if loan is new push it to the array of active loans
        if (_ln.status == Loan.Status.NEW) {
            usersActiveLoans[_ln.borrower].push(_id);
            // if it closed remove it from the array
        } else if (_ln.status == Loan.Status.CLOSED) {
            // find the loan by looping through the entire array
            for (uint256 i = 0; i < usersActiveLoans[_ln.borrower].length; i++) {
                // once finding it, delete it from array and return
                if (usersActiveLoans[_ln.borrower][i] == _id) {
                    usersActiveLoans[_ln.borrower][i] = usersActiveLoans[_ln.borrower][
                        usersActiveLoans[_ln.borrower].length - 1
                    ];
                    usersActiveLoans[_ln.borrower].pop();
                    return;
                }
            }
        }
    }
}
