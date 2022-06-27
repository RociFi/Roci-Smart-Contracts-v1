// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import {ONE_HUNDRED_PERCENT} from "../Globals.sol";
import "../investorContract/PoolInvestor.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PoolInvestorDisclosurer is PoolInvestor{
    //using PoolRateCalculator for uint;
    uint256 public oneHundredPercents  = ONE_HUNDRED_PERCENT;

    constructor(
        IAddressBook _addressBook,
        address _token,
        bytes1 _prefix,
        bytes1 _postfix
        ) PoolInvestor(_addressBook,_token,_prefix,_postfix) {}

    function getTestToken() public view returns (IERC20Metadata){
      return token;
    }

    function getOneYear() public pure returns(uint256){
      return ONE_YEAR;
    }

    function sendFunds(address _receiver, uint256 _amount) external {
      super._sendFunds(_receiver, _amount);
    }

    function checkAvailable(uint256 _amount) external {
      super._checkAvailable(_amount);
    }

    function mintForTest(address account, uint256 amount) external {
      _mint(account, amount);
    }

}
