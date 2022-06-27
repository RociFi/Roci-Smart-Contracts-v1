// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20{

    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol){
        _mint(msg.sender, 10000000000 ether);
    }

    // function setAllowance(address owner, address spender,uint256 amount) public {
    //     // super._allowances[owner][spender]=amount;

    // }

    function setAllowance(address owner,address spender, uint256 value) public virtual returns (bool) {
        _approve(owner, spender,  value);
        return true;
    }
}