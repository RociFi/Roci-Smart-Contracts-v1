//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {ONE_HUNDRED_PERCENT} from "../Globals.sol";

/**
 * @title ReserveBondingCurve
 * @author RociFI Labs
 * @dev library contract to allow for easy reserve ratios enabled by bonding curves. Does the math for ERC20s
 */
library PoolRateCalculator {
    /**
     * @dev returns the amount of debt tokens to be given for the amount of payment tokens input
     */
    function getDepositAmount(
        uint256 _amount,
        uint256 _paymentTokenReserve,
        uint256 _debtTokenTotalSupply,
        uint256 _reserveRate
    ) internal pure returns (uint256 out) {
        out = _getAmountOut(
            _amount,
            _paymentTokenReserve, // payment token is reserve in
            _debtTokenTotalSupply, // debt token is reserve out
            _reserveRate,
            true
        );
    }

    /**
     * @dev returns the amount of payment tokens to be given for the amount of payment tokens input
     */
    function getWithdrawalAmount(
        uint256 _amount,
        uint256 _paymentTokenReserve,
        uint256 _debtTokenTotalSupply,
        uint256 _reserveRate
    ) internal pure returns (uint256 out) {
        out = _getAmountOut(
            _amount,
            _debtTokenTotalSupply, // debt token supply is reserve in,
            _paymentTokenReserve, // payment token is reserve out
            _reserveRate,
            false
        );
    }

    /**
    * @dev function with the uniswap bonding curve logic but with the reserve ratio logic thrown in
        reserve ratio is for payment tokens.
        so a reserver ratio of 20% means that 20% of the debt token supply must be stored in this contract for exchange 1:1
    *
    * Formula for Debt Tokens Out = Reserve Ratio * ((stablesIn * Total Debt) / Total Liquidity + StablesIn(1- Reserve Ratio))
    *
    * Formula for Stablecoins Out = 1/Reserve Ratio * ((Debt In * Total Liquidity) / Total Debt + Debt In(1- Reserve Ratio))
     */
    function _getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 _reserveRatio,
        bool purchaseIn
    ) private pure returns (uint256) {
        uint256 amountInWithFee = amountIn;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = ((reserveIn) +
            (((ONE_HUNDRED_PERCENT - _reserveRatio) * amountInWithFee) / ONE_HUNDRED_PERCENT));
        return
            purchaseIn
                ? (numerator * _reserveRatio) / ((denominator) * ONE_HUNDRED_PERCENT)
                : (numerator * ONE_HUNDRED_PERCENT) / ((denominator) * _reserveRatio);
    }
}
