// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import '@openzeppelin/contracts/access/AccessControl.sol';
import './interfaces/IExchange.sol';
import './interfaces/IDFIToken.sol';
import './interfaces/IUniswapV2Router.sol';

/**
 * Implementation of the {IExchange} interface.
 *
 * Ethereum DFI Exchange allows Ethereum accounts to convert their WINGS or ETH
 * to DFI and vice versa.
 *
 * Swap between WINGS and DFI happens with 1 to 1 ratio.
 *
 * To enable swap the Exchange plays a role of a storage for WINGS tokens as
 * well as a minter of DFI Tokens.
 *
 * Swaps involving ETH take place using Automated Liquidity Protocol - Uniswap.
 * Uniswap allows to make instant swaps between WINGS-ETH pair.
 */
contract Exchange is AccessControl, IExchange {
    IERC20 private immutable _wingsToken;
    IDFIToken private immutable _dfiToken;
    IUniswapV2Router private immutable _uniswapRouter;

    bool private _stopped = false;

    /**
     * Sets {DEFAULT_ADMIN_ROLE} (alias `owner`) role for caller.
     * Initializes Wings Token, DFI Token and Uniswap Router.
     */
    constructor (address wingsToken, address dfiToken, address uniswapRouter) public {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _wingsToken = IERC20(wingsToken);
        _dfiToken = IDFIToken(dfiToken);
        _uniswapRouter = IUniswapV2Router(uniswapRouter);
    }

    /**
     * Returns amounts estimation for swap of WINGS-DFI pair.
     */
    function estimateSwapWINGSForDFI(uint256 amountIn) external view override returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountIn;
    }

    /**
     * Returns amounts estimation for swap of ETH-DFI pair.
     */
    function estimateSwapETHForDFI(uint256 amountIn) external view override returns (uint256[] memory amounts) {
        address[] memory path = new address[](2);
        path[0] = _uniswapRouter.WETH();
        path[1] = address(_dfiToken);

        amounts = _uniswapRouter.getAmountsOut(amountIn, path);
    }

    /**
     * Returns amounts estimation for swap of DFI-WINGS pair.
     */
    function estimateSwapDFIForWINGS(uint256 amountIn) external view override returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountIn;
    }

    /**
     * Returns amounts estimation for swap of DFI-ETH pair.
     */
    function estimateSwapDFIForETH(uint256 amountIn) external view override returns (uint256[] memory amounts) {
        address[] memory path = new address[](2);
        path[0] = address(_dfiToken);
        path[1] = _uniswapRouter.WETH();

        amounts = _uniswapRouter.getAmountsOut(amountIn, path);
    }

    /**
     * Returns whether swapping is stopped.
     */
    function isSwappingStopped() external view override returns (bool) {
        return _stopped;
    }

    /**
     * Executes swap of WINGS-DFI pair.
     *
     * Emits a {SwapWINGSForDFI} event.
     *
     * Requirements:
     * - Contract is not stopped.
     */
    function swapWINGSForDFI(uint256 amountIn) external override returns (uint256[] memory amounts) {
        _beforeSwap();

        require(_wingsToken.transferFrom(msg.sender, address(this), amountIn), 'Exchange: transferFrom failed');
        require(_dfiToken.mint(msg.sender, amountIn), 'Exchange: mint failed');

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountIn;

        emit SwapWINGSForDFI(msg.sender, amounts[0], amounts[amounts.length - 1]);
    }

    /**
     * Executes swap of ETH-DFI pair.
     *
     * Emits a {SwapETHForDFI} event.
     *
     * Requirements:
     * - Contract is not stopped.
     */
    function swapETHForDFI(uint256 amountOutMin) external payable override returns (uint256[] memory amounts) {
        _beforeSwap();

        address[] memory path = new address[](2);
        path[0] = _uniswapRouter.WETH();
        path[1] = address(_wingsToken);

        amounts = _uniswapRouter.swapExactETHForTokens{value: msg.value}(amountOutMin, path, address(this), block.timestamp);

        require(_dfiToken.mint(msg.sender, amounts[amounts.length - 1]), 'Exchange: mint failed');

        emit SwapETHForDFI(msg.sender, amounts[0], amounts[amounts.length - 1]);
    }

    /**
     * Executes swap of DFI-WINGS pair.
     *
     * Emits a {SwapDFIForWINGS} event.
     *
     * Requirements:
     * - Contract is not stopped.
     */
    function swapDFIForWINGS(uint256 amountIn) external override returns (uint256[] memory amounts) {
        _beforeSwap();

        require(_dfiToken.burn(msg.sender, amountIn), 'Exchange: burn failed');
        require(_wingsToken.transfer(address(this), amountIn), 'Exchange: transfer failed');

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountIn;

        emit SwapDFIForWINGS(msg.sender, amounts[0], amounts[amounts.length - 1]);
    }

    /**
     * Executes swap of DFI-ETH pair.
     *
     * Emits a {SwapDFIForETH} event.
     *
     * Requirements:
     * - Contract is not stopped.
     */
    function swapDFIForETH(uint256 amountIn, uint256 amountOutMin) external override returns (uint256[] memory amounts) {
        _beforeSwap();

        require(_dfiToken.transferFrom(msg.sender, address(this), amountIn), 'Exchange: transferFrom failed');
        require(_dfiToken.approve(address(_uniswapRouter), amountIn), 'Exchange: approve failed');

        // amountOutMin must be retrieved from an oracle of some kind
        address[] memory path = new address[](2);
        path[0] = address(_dfiToken);
        path[1] = _uniswapRouter.WETH();

        amounts = _uniswapRouter.swapExactTokensForETH(amountIn, amountOutMin, path, msg.sender, block.timestamp);

        emit SwapDFIForETH(msg.sender, amounts[0], amounts[amounts.length - 1]);
    }

    /**
     * Starts all swaps.
     *
     * Emits a {SwapsStarted} event.
     *
     * Requirements:
     * - Caller must have owner role.
     * - Contract is stopped.
     */
    function startSwaps() external override returns (bool) {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'DFIToken: sender is not owner');
        require(_stopped, 'Exchange: swapping is not stopped');

        _stopped = false;

        emit SwapsStarted();

        return true;
    }

    /**
     * Stops all swaps.
     *
     * Emits a {SwapsStopped} event.
     *
     * Requirements:
     * - Caller must have owner role.
     * - Contract is not stopped.
     */
    function stopSwaps() external override returns (bool) {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'DFIToken: sender is not owner');
        require(!_stopped, 'Exchange: swapping is stopped');

        _stopped = true;

        emit SwapsStopped();

        return true;
    }

     /**
      * Withdraws `amount` of locked WINGS to a destination specified as `to`.
      *
      * Emits a {WINGSWithdrawal} event.
      *
      * Requirements:
      * - Caller must have owner role.
      */
    function withdrawWINGS(address to, uint256 amount) external override returns (bool) {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'DFIToken: sender is not owner');

        require(_wingsToken.transfer(to, amount), 'Exchange: transfer failed');

        emit WINGSWithdrawal(to, amount);

        return true;
    }

    /**
     * Executes before swap hook.
     *
     * Requirements:
     * - Contract is not stopped.
     */
    function _beforeSwap() internal view {
        require(!_stopped, 'Exchange: swapping is stopped');
    }
}
