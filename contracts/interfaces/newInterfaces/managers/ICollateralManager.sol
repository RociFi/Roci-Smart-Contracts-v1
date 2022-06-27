/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "./IManager.sol";

/**
 * @title ICollateralManager
 * @author RociFI Labs
 * @notice A contract to manage the collateral of the Roci protocol
 * @dev the overrides of deposit/withdrawal will probably need to use data to store the loan ID
 */
interface ICollateralManager is IManager {
    /**
     * @dev function to return the ERC20 contract AND amount for a collateral deposit
     * @param _paymentContract address
     * @param _user of borrower
     * @return ERC20 contract address of collateral
     * @return Collateral amount deposited
     */
    function getCollateralLookup(address _paymentContract, address _user)
        external
        view
        returns (address, uint256);
}
