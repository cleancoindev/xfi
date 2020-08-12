// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import './IERC20.sol';

/**
 * XFI token extends the interface of ERC20 standard.
 */
interface IXFIToken is IERC20 {
    event TransfersStarted();
    event TransfersStopped();

    function isTransferringStopped() external view returns (bool);
    
    function mint(address account, uint256 amount) external returns (bool);
    function burn(uint256 amount) external returns (bool);
    function burnFrom(address account, uint256 amount) external returns (bool);

    function startTransfers() external returns (bool);
    function stopTransfers() external returns (bool);
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool);
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool);
}
