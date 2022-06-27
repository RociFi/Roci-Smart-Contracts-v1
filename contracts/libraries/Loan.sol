/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import {ONE_DAY, ONE_HUNDRED_PERCENT} from "../Globals.sol";
import {Errors} from "../libraries/Errors.sol";

/**
* @title Loan
* @author RociFI Labs
* @dev Library to abstract out edits to Loan object to help with global variable tracking
    NOTE
    In this library the function paramaters may seem confusing
    This is because there are special global/local instances of these loan objects

    _ln is an individual loan
    _user is a user's global amount in this payment contract
    _global is the payment contracts total sums
 */
library Loan {
    //Loan object. Stores lots of info about each loan
    enum Status {
        UNISSUED,
        NEW,
        APPROVED,
        PAIDPART,
        CLOSED,
        PAIDLATE,
        DEFAULT,
        LATE
    }
    struct loan {
        Status status;
        address ERC20Address;
        address poolAddress;
        address borrower;
        uint256 nfcsID;
        uint256 maturityDate;
        uint128 issueDate;
        uint256 minPayment;
        uint256 interestRate;
        uint256 accrualPeriod;
        uint256 principal;
        uint256 totalPaymentsValue;
        uint256 awaitingCollection;
        uint256 awaitingInterest;
        uint256 paymentComplete;
        uint256 ltv;
        uint256 lt;
        uint16 score;
    }

    struct globalInfo {
        uint256 principal;
        uint256 totalPaymentsValue;
        uint256 paymentComplete;
        uint128 borrowedToday;
        uint128 lastBorrowTimestamp;
    }

    /**
     * @dev onPayment function to check and handle updates to struct for payments
     * @param _ln individual loan
     * @param _user global loan for user
     * @param _global global loan for the whole contract
     */
    function onPayment(
        loan storage _ln,
        globalInfo storage _user,
        globalInfo storage _global,
        globalInfo storage _nfcs,
        uint256 _erc20Amount
    ) internal {
        require(
            _erc20Amount >= _ln.minPayment || //Payment must be more than min payment
                (getOutstanding(_ln) < _ln.minPayment && //Exception for the last payment (remainder)
                    _erc20Amount >= getOutstanding(_ln)), // Exception is only valid if user is paying the loan off in full on this transaction
            Errors.LOAN_MIN_PAYMENT
        );

        _ln.awaitingCollection += _erc20Amount;

        _ln.paymentComplete += _erc20Amount; //Increase paymentComplete
        _user.paymentComplete += _erc20Amount;
        _global.paymentComplete += _erc20Amount;
        _nfcs.paymentComplete += _erc20Amount;

        // do a status update for anything payment dependant
        if (isComplete(_ln) && _ln.status != Status.DEFAULT && _ln.status != Status.CLOSED) {
            _ln.status = Status.CLOSED;
        } else if (_erc20Amount > 0 && !isLate(_ln)) {
            _ln.status = Status.PAIDPART;
        } else if (isLate(_ln)) {
            _ln.status = Status.PAIDLATE;
        }

        _updateLoanDay(_user);
        _updateLoanDay(_global);
    }

    function onWithdrawal(loan storage _ln, uint256 _erc20Amount) internal {
        _ln.awaitingCollection -= _erc20Amount;
        _ln.awaitingInterest = 0;
    }

    function onLiquidate(loan storage _ln, bool def) internal {
        _ln.status = def ? Status.DEFAULT : Status.CLOSED;
    }

    function limitGlobalCheck(
        uint256 _totalOutstanding,
        uint128 _limit,
        string memory exeption
    ) internal pure {
        if (_limit != 0) {
            require(_totalOutstanding <= _limit, exeption);
        }
    }

    function limitDailyCheck(
        loan storage _ln,
        globalInfo storage _limitInfo,
        uint128 _limit,
        string memory exeption
    ) internal {
        if (_limit != 0) {
            _updateLoanDay(_limitInfo);
            // Ensure that amount borrowed in last 24h + current borrow amount is less than the 24 limit for this user
            require(_limitInfo.borrowedToday + _ln.principal <= _limit, exeption);
            // Increase 24 limit by amount borrowed
            _limitInfo.borrowedToday += uint128(_ln.principal);
        }
    }

    /**
     * @dev function increases the total payment value on the loan for interest accrual
     * @param _ln individual loan
     * @param _user global loan for user
     * @param _global global loan for the whole contract
     */

    function increaseTotalPaymentsValue(
        loan storage _ln,
        globalInfo storage _user,
        globalInfo storage _global,
        globalInfo storage _nfcs,
        uint256 _am,
        uint256 penaltyAPYMultiplier
    ) internal {
        // if loan is late we give an APR multiplier
        if (
            isLate(_ln) &&
            _ln.status != Status.LATE &&
            _ln.status != Status.PAIDLATE &&
            _ln.status != Status.DEFAULT
        ) {
            _ln.status = Status.LATE;
            _ln.interestRate = _ln.interestRate * penaltyAPYMultiplier;
        }
        _ln.awaitingInterest += _am;
        _ln.totalPaymentsValue += _am;
        _user.totalPaymentsValue += _am;
        _global.totalPaymentsValue += _am;
        _nfcs.totalPaymentsValue += _am;
    }

    /// @dev function to issue a loan
    function issue(
        loan storage _ln,
        globalInfo storage _user,
        globalInfo storage _global,
        globalInfo storage _nfcs
    ) internal {
        require(_ln.status == Status.NEW, Errors.LOAN_CONFIGURATION);

        _ln.status = Status.APPROVED;
        _ln.issueDate = uint128(block.timestamp);

        _user.principal += _ln.principal;
        _user.totalPaymentsValue += _ln.totalPaymentsValue;
        _user.paymentComplete += _ln.paymentComplete;

        _global.principal += _ln.principal;
        _global.totalPaymentsValue += _ln.totalPaymentsValue;
        _global.paymentComplete += _ln.paymentComplete;

        _nfcs.principal += _ln.principal;
        _nfcs.totalPaymentsValue += _ln.totalPaymentsValue;
        _nfcs.paymentComplete += _ln.paymentComplete;
    }

    /// @dev helper function returns if loan is complete
    function isComplete(loan storage _ln) internal view returns (bool) {
        return _ln.paymentComplete >= _ln.totalPaymentsValue;
    }

    /// @dev function returns if loan is late
    function isLate(loan storage _ln) internal view returns (bool) {
        return (block.timestamp >= _ln.maturityDate);
    }

    function getOutstanding(loan memory _ln) internal pure returns (uint256) {
        if (_ln.paymentComplete > _ln.totalPaymentsValue) {
            return 0;
        }
        return (_ln.totalPaymentsValue - _ln.paymentComplete);
    }

    function getOutstanding(globalInfo memory _global) internal pure returns (uint256) {
        if (_global.paymentComplete > _global.totalPaymentsValue) {
            return 0;
        }
        return (_global.totalPaymentsValue - _global.paymentComplete);
    }

    function _updateLoanDay(globalInfo storage _user) private {
        // If current time - last borrow time = is greater than 24 hours
        if ((block.timestamp - _user.lastBorrowTimestamp) >= ONE_DAY) {
            // then reset daily limit
            _user.borrowedToday = 0;
        }
        // Set lastBorrowedTimestamp for this user to now
        _user.lastBorrowTimestamp = uint128(block.timestamp);
    }
}
