// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "../../contracts/libraries/Functions.sol";

contract FunctionsMock {
    function roundedDiv(uint256 a, uint256 b) public pure returns (uint256) {
        return Functions.roundedDiv(a, b);
    }

    function quickSortDESC(uint[] memory arr, int left, int right) public pure returns (uint[] memory) {
        Functions.quickSortDESC(arr, left, right);
        return arr;
    }

    function isUnique(uint[] memory arr) public pure returns (bool) {
        return Functions.isUnique(arr);
    }
}