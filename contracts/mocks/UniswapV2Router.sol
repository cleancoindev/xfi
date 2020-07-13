// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import '../interfaces/IUniswapV2Router.sol';
import '../interfaces/IERC20.sol';

contract UniswapV2Router is IUniswapV2Router {
    uint256 private constant WINGS_PER_ETH = 100;
    IERC20 private immutable _wingsToken;

    constructor(address wingsToken) public {
        _wingsToken = IERC20(wingsToken);
    }

    receive() external payable { }

    function WETH() external view override returns (address) {
        return address(this);
    }

    function getAmountsOut(uint256 amountIn, address[] memory path) public view override returns (uint256[] memory amounts) {
        // WINGS-ETH
        if ((path[0] == address(_wingsToken)) && (path[1] == address(this))) {
            amounts = new uint256[](2);
            amounts[0] = amountIn;
            amounts[1] = amountIn / WINGS_PER_ETH;
        }

        // ETH-WINGS
        if ((path[0] == address(this)) && (path[1] == address(_wingsToken))) {
            amounts = new uint256[](2);
            amounts[0] = amountIn;
            amounts[1] = amountIn * WINGS_PER_ETH;
        }
    }

    function swapExactETHForTokens(uint256 /*amountOutMin*/, address[] calldata path, address to, uint256 /*deadline*/)
        external
        payable
        override
        returns (uint256[] memory amounts)
    {
        amounts = getAmountsOut(msg.value, path);

        require(_wingsToken.transfer(to, amounts[1]), 'UniswapV2Router: WINGS transfer failed');
    }

    function swapExactTokensForETH(uint256 amountIn, uint256 /*amountOutMin*/, address[] calldata path, address to, uint256 /*deadline*/)
        external
        override
        returns (uint256[] memory amounts)
    {
        amounts = getAmountsOut(amountIn, path);

        require(_wingsToken.transferFrom(msg.sender, address(this), amounts[0]), 'UniswapV2Router: WINGS transferFrom failed');

        _safeTransferETH(to, amounts[1]);
    }

    function _safeTransferETH(address to, uint value) internal {
        (bool success,) = to.call{value:value}(new bytes(0));
        require(success, 'UniswapV2Router: ETH transfer failed');
    }
}
