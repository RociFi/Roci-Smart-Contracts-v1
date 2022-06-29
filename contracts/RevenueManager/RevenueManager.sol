/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "./PaymentSplitter.sol";
import {Errors} from "../libraries/Errors.sol";

/**
 * @title Revenue Manager
 * @author RociFI Labs
 * @dev A contract to manage the revenues of the Roci Platform
 */
contract RevenueManager is PaymentSplitter {
    using SafeERC20 for IERC20Metadata;

    constructor(IAddressBook _addressBook) PaymentSplitter(_addressBook) {}

    // Events
    event BalancingFundsRequested(
        uint256 timestamp,
        address indexed _token,
        uint256 indexed _amount
    );

    /**
     * @dev for investors to request funds (for balancing)
     */
    function requestFunds(address _token, uint256 _amount) external whenNotPaused verifyInvestor {
        IERC20Metadata t = IERC20Metadata(_token);
        require(balanceAvailable(msg.sender) >= _amount, Errors.REVENUE_NOT_ENOUGH_FUNDS);
        t.safeTransfer(msg.sender, _amount);
        poolBalances[msg.sender] -= _amount;
        emit BalancingFundsRequested(block.timestamp, _token, _amount);
    }

    /**
     * @dev  returns the balance available for a caller to request
     */
    function balanceAvailable(address _poolAddress) public view returns (uint256) {
        return poolBalances[_poolAddress];
    }
}
