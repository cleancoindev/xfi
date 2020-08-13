// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface IExchange {
    event SwapWINGSForXFI(address indexed sender, uint256 amountIn, uint256 amountOut);
    event SwapETHForXFI(address indexed sender, uint256 amountIn, uint256 amountOut);
    event SwapsStarted();
    event SwapsStopped();
    event DeadlineChanged(uint256 newDeadline);
    event WINGSWithdrawal(address indexed to, uint256 amount);

    function wingsToken() external view returns (address);
    function xfiToken() external view returns (address);
    function deadline() external view returns (uint256);
    function uniswapRouter() external view returns (address);
    function estimateSwapWINGSForXFI(uint256 amountIn) external view returns (uint256[] memory amounts);
    function estimateSwapETHForXFI(uint256 amountIn) external view returns (uint256[] memory amounts);
    function isSwappingStopped() external view returns (bool);

    function swapWINGSForXFI(uint256 amountIn) external returns (uint256[] memory amounts);
    function swapETHForXFI(uint256 amountOutMin) external payable returns (uint256[] memory amounts);
    function stopSwaps() external returns (bool);
    function startSwaps() external returns (bool);
    function changeDeadline(uint256 deadline_) external returns (bool);
    function withdrawWINGS(address to, uint256 amount) external returns (bool);
}
