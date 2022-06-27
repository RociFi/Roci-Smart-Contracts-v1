// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import {Version} from "../Version/Version.sol";

contract TestVersion is Version {
    constructor() {}

    function currentVersion() public pure override returns (string memory) {
        return "1.0.0";
    }

    function ping(string memory version) 
        public
        view
        checkVersion(version)
        returns(bool)
    {
        return true;
    }
}
