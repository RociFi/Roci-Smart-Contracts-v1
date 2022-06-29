/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

interface IPaymentSplitter{

    function payment(address, uint) external;

    function getRevenueManagerShare(uint256) external view returns (uint256);

    function sendToShareHolders(address, uint) external;
}
