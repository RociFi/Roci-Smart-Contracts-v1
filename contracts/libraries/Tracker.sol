/// SPDX-License-Identifier: None
pragma solidity ^0.8.0;

import "./Loan.sol";

/**
 * @title Tracker
 * @author RociFI Labs
 */
library Tracker {
    address constant TAIL = 0x000000000000000000000000000000000000dEaD;
    struct node {
        address next;
        uint256 val;
    }
    // each object contains an enumerable map of payment token addresses => outstanding balance
    struct outstandings {
        address head;
        uint256 length;
        mapping(address => node) tokenToLoan;
    }

    function updateCollateral(outstandings storage c, Loan.loan memory ln) internal {
        // if this is the first time this token is input push it to the list of tokens
        // meaning if next points to 0 but it's not just the first element
        if (c.tokenToLoan[ln.ERC20Address].next == address(0)) {
            _push(c, ln.ERC20Address);
        }

        // then update the value
        c.tokenToLoan[ln.ERC20Address].val = Loan.getOutstanding(ln);
    }

    function toArrays(outstandings storage c)
        internal
        view
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        address tmp = (c.head == address(0)) ? TAIL : c.head;
        tokens = new address[](c.length);
        amounts = new uint256[](c.length);

        for (uint256 i = 0; i < c.length; i++) {
            tokens[i] = tmp;
            amounts[i] = c.tokenToLoan[tmp].val;
            tmp = c.tokenToLoan[tmp].next;
        }
    }

    function _push(outstandings storage c, address key) private {
        if (c.head == address(0)) {
            c.head = key;
            c.tokenToLoan[key].next = TAIL;
        } else {
            c.tokenToLoan[key].next = c.head;
            c.head = key;
        }
        c.length++;
    }
}
