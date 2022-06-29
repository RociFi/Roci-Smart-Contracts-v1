/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "../interfaces/newInterfaces/managers/ICollateralManager.sol";
import "../manager/Manager.sol";

/**
 * @title CollateralManager
 * @author RociFI Labs
 * @notice A contract to manage the collateral of the Roci protocol
 */

contract CollateralManager is ICollateralManager, Manager {
    constructor(IAddressBook _addressBook) AddressHandler(_addressBook) {}

    /**
     * @dev function to return the ERC20 contract AND amount for a collateral deposit
     * @param _paymentContract address
     * @param _user borrower
     * @return ERC20 contract address of collateral
     * @return Collateral amount deposited
     */
    function getCollateralLookup(address _paymentContract, address _user)
        external
        view
        override
        returns (address, uint256)
    {
        return (
            collateralLookup[_paymentContract][_user].ERC20Contract,
            collateralLookup[_paymentContract][_user].amount
        );
    }
}
