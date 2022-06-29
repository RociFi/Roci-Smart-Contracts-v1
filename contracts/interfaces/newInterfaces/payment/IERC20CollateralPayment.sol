/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "./IERC20PaymentStandard.sol";
import "../../../Version/IVersion.sol";

/**
 * @title IERC20PaymentStandard
 * @author RociFI Labs
 * @dev
 * ERC20CollateralPayment should only deal with adding collateral to the existing payment system.
 * CollateralPayment changes the definition of delinquent loans to be loans that don’t meat LTV/LT requirements
 * as defined by a loan’s NFCS. Collateral payment also allows for liquidations by liquidators.
 * However, collateralPayment does not hold any collateral and instead delegates the holding of collateral to a manager.
 * CollateralPayment only handles logic for collateral and it’s relation to a loan’s status.
 */
interface IERC20CollateralPayment is IVersion, IERC20PaymentStandard {
    // more addresses for address book
    enum addresses_Collateral {
        bondContract,
        NFCS,
        collateralManager,
        priceFeed,
        oracle
    }

    // addresses removed in favor of addressBook.

    /**
     * @notice addCollateral must be called before issuing loan
     * @param _ERC20Contract address of the ERC20 you want to have as collaterall. DOES NOT have to be equal to payment ERC20
     * @param _amount is the ammount to add as collateral
     */
    function addCollateral(
        address _from,
        address _ERC20Contract,
        uint256 _amount
    ) external;

    // NOTE no need for changing manager or price feed since they're in addressBook

    function getMaxWithdrawableCollateral() external view returns (uint256);

    /*
     * @notice function for user to claim their collateral as they go. Must be within their LTV
     * @param _token to collect
     * @param _amount to withdrawal
     */
    function claimCollateral(
        address _token,
        uint256 _amount,
        string memory version
    ) external;

    /*
     * @notice function that return true if loan is deliquient
     * @param _id of the loan
     */
    function isDelinquent(uint256 _id) external view returns (bool);
}
