/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import {IVersion} from "../Version/IVersion.sol";
/**
 * @title ILiquidator
 * @author OxideDall
 * @dev 
 * Anything specific to liquidation should be in this contract.
*/
interface ILiquidator is IVersion {
    /**
     * @dev function for admin to liquidate a loan manually after loan maturity dates
     */
    function liquidate(uint256[] memory _ids) external;

}