// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface IExchange {
    event SwapWINGSForDFI(address indexed sender, uint256 amountIn, uint256 amountOut);
    event SwapETHForDFI(address indexed sender, uint256 amountIn, uint256 amountOut);
    event SwapDFIForWINGS(address indexed sender, uint256 amountIn, uint256 amountOut);
    event SwapDFIForETH(address indexed sender, uint256 amountIn, uint256 amountOut);
    event SwapsStarted();
    event SwapsStopped();
    event WINGSWithdrawal(address indexed to, uint256 amount);

    function wingsToken() external view returns (address);
    function dfiToken() external view returns (address);
    function uniswapRouter() external view returns (address);
    function estimateSwapWINGSForDFI(uint256 amountIn) external view returns (uint256[] memory amounts);
    function estimateSwapETHForDFI(uint256 amountIn) external view returns (uint256[] memory amounts);
    function estimateSwapDFIForWINGS(uint256 amountIn) external view returns (uint256[] memory amounts);
    function estimateSwapDFIForETH(uint256 amountIn) external view returns (uint256[] memory amounts);
    function isSwappingStopped() external view returns (bool);

    function swapWINGSForDFI(uint256 amountIn) external returns (uint256[] memory amounts);
    function swapETHForDFI(uint256 amountOutMin) external payable returns (uint256[] memory amounts);
    function swapDFIForWINGS(uint256 amountIn) external returns (uint256[] memory amounts);
    function swapDFIForETH(uint256 amountIn, uint256 amountOutMin) external returns (uint256[] memory amounts);
    function stopSwaps() external returns (bool);
    function startSwaps() external returns (bool);
    function withdrawWINGS(address to, uint256 amount) external returns (bool);
}
