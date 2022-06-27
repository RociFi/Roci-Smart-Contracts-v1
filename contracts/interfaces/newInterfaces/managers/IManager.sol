// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IAddressBook} from "../../IAddressBook.sol";

/**
 * @title IManager
 * @author RociFI Labs
 * @dev base contract for other managers. Contracts that hold funds for others, keep track of the owners,
 *   and also have accepted deposited fund types that can be updated.
 */
interface IManager {
    // function deposit(uint _amount, bytes memory _data) external;
    function deposit(
        address _from,
        address _erc20,
        uint256 _amount
    ) external;

    // function withdrawal(uint _amount, address _receiver, bytes memory _data) external;
    function withdrawal(
        address user,
        uint256 _amount,
        address _receiver
    ) external;

    function addAcceptedDeposits(address[] memory) external;

    function removeAcceptedDeposits(address[] memory) external;
}
