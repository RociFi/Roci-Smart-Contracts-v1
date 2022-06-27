/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "./IPaymentSplitter.sol";

interface IRevenueManager is IPaymentSplitter{

    function balanceAvailable(address) external view returns(uint);

    function requestFunds(address, uint) external;
}