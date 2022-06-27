/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "./IManager.sol";

/**
 * @title IRevenue Manager
 * @author RociFI Labs
 * @dev A contract to manage the revenues of the Roci Platform.
 *   remember to include payment splitter
 */
interface IRevenueManager is IManager {
    // shouldn't need anything else here yet besides payment splitter integration
}
