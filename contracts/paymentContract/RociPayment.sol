/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "./ERC20CollateralPayment.sol";

import "@openzeppelin/contracts/utils/Strings.sol";

import {IRociPayment} from "../interfaces/newInterfaces/payment/IRociPayment.sol";
import {ROCI_PAYMENT_VERSION} from "../ContractVersions.sol";
import {ScoreDBInterface} from "../interfaces/ScoreDBInterface.sol";
import {Errors} from "../libraries/Errors.sol";
import {ROLE_ADMIN, ROLE_LIQUIDATOR} from "../Globals.sol";

contract RociPayment is ERC20CollateralPayment, IRociPayment {
    // Events
    event Liquidated(uint256 timestamp, uint256 indexed loanId, address borrower, bool success);

    constructor(address _addressBook) ERC20CollateralPayment(_addressBook) {}

    /**
     * @dev function for admin to liquidate a loans manually
     */
    function liquidateLoans(uint256[] memory _ids, string memory version)
        external
        override
        onlyRole(ROLE_LIQUIDATOR)
        checkVersion(version)
    {
        uint8 numOfLiquidated = 0;
        for (uint256 i = 0; i < _ids.length; i++) {
            bool isDelinquent = isDelinquent(_ids[i]);

            if (isDelinquent) {
                liquidateLoan(_ids[i], msg.sender);
                numOfLiquidated++;
            }

            Loan.loan memory _loan = _loanLookup[_ids[i]];

            _afterLoanChange(_loan, _ids[i]);

            emit Liquidated(block.timestamp, _ids[i], _loan.borrower, isDelinquent);
        }
        require(numOfLiquidated != 0, Errors.PAYMENT_LOAN_NOT_DELINQUENT);
    }

    function isScoreValidForBorrow(
        address user,
        uint256 nfcsId,
        uint16[] memory validScores
    ) external view override returns (bool) {
        if (validScores.length == 0) {
            return false;
        }

        uint16 score = ScoreDBInterface(lookup(ROLE_ORACLE)).getScore(nfcsId).creditScore;

        bool isValidPool = false;
        for (uint8 i = 0; i < validScores.length; i++) {
            if (score == validScores[i]) {
                isValidPool = true;
            }
        }

        uint256[] memory loans = usersActiveLoans[user];
        if (loans.length == 0) {
            return isValidPool;
        }

        return isValidPool && score == _loanLookup[loans[0]].score;
    }

    /**
     * @dev function to get a user's total outstanding balance (By NFCS ID)
     * @param _nfcsId NFCS ID
     * @return total Outstanding balance
     */
    function getNFCSTotalOutstanding(uint256 _nfcsId) external view override returns (uint256) {
        return (Loan.getOutstanding(nfcsLoanLookup[_nfcsId]));
    }

    /**
     * @dev function to get a user's total outstanding balance (By NFCS ID)
     * @param _nfcsId NFCS ID
     * @return total Outstanding balance
     */
    function getUserTotalOutstanding(uint256 _nfcsId) external view override returns (uint256) {
        address user = IERC721(lookup(ROLE_NFCS)).ownerOf(_nfcsId);
        return (Loan.getOutstanding(globalLoanLookup[user]));
    }

    /**
     * @dev function to get a system total outstanding balance
     * @return total Outstanding balance
     */
    function getTotalOutstanding() external view override returns (uint256) {
        return (Loan.getOutstanding(globalLoanLookup[address(0)]));
    }

    /**
     * @notice returns the current version of the contract.
     */
    function currentVersion() public pure override returns (string memory) {
        return ROCI_PAYMENT_VERSION;
    }
}
