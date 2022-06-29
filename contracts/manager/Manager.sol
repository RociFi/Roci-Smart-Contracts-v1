/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "../interfaces/newInterfaces/managers/IManager.sol";
import "../utilities/AddressHandler.sol";
import "../libraries/Structs.sol";
import {Errors} from "../libraries/Errors.sol";
import {ROLE_PAUSER, ROLE_ADMIN} from "../Globals.sol";

/**
 * @title Manager
 * @author RociFi Labs
 * @notice A contract to manage the collateral of the Roci protocol
 */

abstract contract Manager is IManager, AddressHandler, Pausable {
    using SafeERC20 for IERC20Metadata;

    // mapping is payment contract (investor) => loan ID => collateral
    mapping(address => mapping(address => Structs.collateral)) internal collateralLookup;
    // mapping of accepted ERC20 collateral
    mapping(address => bool) public acceptedCollateral;
    // Events
    event AcceptedCollateralAdded(uint256 timestamp, address[] indexed ERC20Tokens);
    event AcceptedCollateralRemoved(uint256 timestamp, address[] indexed ERC20CTokens);

    /**
     * @dev function to add more accepted collateral
     * @param _toAdd is the collateral to add
     */
    function addAcceptedDeposits(address[] memory _toAdd) external override onlyRole(ROLE_ADMIN) {
        for (uint256 i = 0; i < _toAdd.length; i++) {
            acceptedCollateral[_toAdd[i]] = true;
        }
        emit AcceptedCollateralAdded(block.timestamp, _toAdd);
    }

    /**
     * @dev function to remove accepted collateral
     * @param _toRemove is the collateral to remove
     */
    function removeAcceptedDeposits(address[] memory _toRemove)
        external
        override
        onlyRole(ROLE_ADMIN)
    {
        for (uint256 i = 0; i < _toRemove.length; i++) {
            acceptedCollateral[_toRemove[i]] = false;
        }

        emit AcceptedCollateralRemoved(block.timestamp, _toRemove);
    }

    function deposit(
        address _from,
        address _erc20,
        uint256 _amount
    ) external override whenNotPaused {
        require(acceptedCollateral[_erc20], Errors.MANAGER_COLLATERAL_NOT_ACCEPTED);
        IERC20Metadata(_erc20).safeTransferFrom(_from, address(this), _amount);

        if (collateralLookup[msg.sender][_from].amount == 0) {
            collateralLookup[msg.sender][_from] = Structs.collateral(
                block.timestamp,
                _erc20,
                _amount
            );
        } else {
            require(
                _erc20 == collateralLookup[msg.sender][_from].ERC20Contract,
                Errors.MANAGER_COLLATERAL_INCREASE
            );
            collateralLookup[msg.sender][_from].amount += _amount;
        }
    }

    /**
     * @dev function to withdra collateral
     * @notice it looks up the collateral based off the payment contract being MSG.sender. Meaning
     *   the payment contract must be the one to call this function
     * @param _user i.e., the borrower
     * @param _amount to withdraw
     * @param _receiver who receives the withdrawn collateral (also the borrower)
     */
    function withdrawal(
        address _user,
        uint256 _amount,
        address _receiver
    ) external override whenNotPaused {
        // Require that the amount of collateral requested to be withdrawn is greater than 0
        require(_amount > 0, Errors.MANAGER_ZERO_WITHDRAW);
        // msg.sender is the collateral payment contract
        // Fetch collateral object for this borrower and collateral payment contract
        // The returned data looks like:
        /*
            struct collateral {
                uint256 creationTimestamp;
                address ERC20Contract;
                uint256 amount;
            }
        */
        Structs.collateral storage c = collateralLookup[msg.sender][_user];
        // Require that the amount being withdrawn is not greater than what is held by this collateral payment contract for this borrower
        require(c.amount >= _amount, Errors.MANAGER_EXCEEDING_WITHDRAW);
        // Reduce the amount by the amount being withdrawn
        c.amount -= _amount;
        // Transfer the amount to the borrower
        IERC20Metadata(c.ERC20Contract).safeTransfer(_receiver, _amount);
    }

    function pause() public onlyRole(ROLE_PAUSER) {
        _pause();
    }

    function unpause() public onlyRole(ROLE_PAUSER) {
        _unpause();
    }
}
