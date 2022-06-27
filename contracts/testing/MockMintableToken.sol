// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract MockMintableToken is ERC20PresetMinterPauser {

    uint8 private  _decimals;

    constructor(string memory _name, string memory _symbol, uint8 decimal)
        ERC20PresetMinterPauser(_name, _symbol)
    {
        _decimals = decimal;
    }

    function decimals() public view override returns(uint8){
        return _decimals;
    }

}
