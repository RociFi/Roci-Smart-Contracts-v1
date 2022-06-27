//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

library Functions {
    /**
     * @dev Division, round to nearest integer (AKA round-half-up)
     * @param a What to divide
     * @param b Divide by this number
     */
    function roundedDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        // Solidity automatically throws, but please emit reason
        require(b > 0, "div by 0"); 

        uint256 halfB = (b % 2 == 0) ? (b / 2) : (b / 2 + 1);
        return (a % b >= halfB) ? (a / b + 1) : (a / b);
    }


    function quickSortDESC(uint[] memory arr, int left, int right) internal pure {
        int i = left;
        int j = right;
        if (i == j) return;
        uint pivot = arr[uint(left + (right - left) / 2)];
        while (i <= j) {
            while (arr[uint(i)] > pivot) i++;
            while (pivot > arr[uint(j)]) j--;
            if (i <= j) {
                (arr[uint(i)], arr[uint(j)]) = (arr[uint(j)], arr[uint(i)]);
                i++;
                j--;
            }
        }
        if (left < j)
            quickSortDESC(arr, left, j);
        if (i < right)
            quickSortDESC(arr, i, right);
    }   

    function isUnique(uint[] memory arr) internal pure returns(bool) {
        for(uint i = 0; i < arr.length; i++) {
            for(uint j = i+1; j < arr.length; j++) {
                if(arr[i]==arr[j]){
                    return false;
                }
            }
        }
        return true;
    }

}