// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RiskRegistry
/// @notice A tiny on-chain registry for Mezo Risk Lab. Any address can
/// save its latest MUSD risk snapshot: the collateral ratio it saw
/// (in basis points, so 15000 means 150%), the BTC liquidation price
/// (scaled by 1e18, the same scale the Mezo PriceFeed uses), a risk
/// band (0 SAFE, 1 WATCH, 2 DANGER, 3 LIQUIDATED) and a short label.
/// Saving again overwrites the snapshot and bumps the save count.
/// The registry holds no funds and controls nothing. It is a public
/// notebook for risk checks, nothing more.
contract RiskRegistry {
    struct Snapshot {
        uint256 collateralRatioBps;
        uint256 liquidationPriceUsd;
        uint8 riskBand;
        string label;
        uint256 updatedAt;
        uint256 count;
    }

    mapping(address => Snapshot) private _snapshots;

    event SnapshotSaved(
        address indexed user,
        uint256 collateralRatioBps,
        uint256 liquidationPriceUsd,
        uint8 riskBand,
        uint256 count,
        uint256 timestamp
    );

    function saveSnapshot(
        uint256 collateralRatioBps,
        uint256 liquidationPriceUsd,
        uint8 riskBand,
        string calldata label
    ) external {
        require(riskBand <= 3, "RiskRegistry: band out of range");
        Snapshot storage snap = _snapshots[msg.sender];
        snap.collateralRatioBps = collateralRatioBps;
        snap.liquidationPriceUsd = liquidationPriceUsd;
        snap.riskBand = riskBand;
        snap.label = label;
        snap.updatedAt = block.timestamp;
        snap.count += 1;
        emit SnapshotSaved(
            msg.sender,
            collateralRatioBps,
            liquidationPriceUsd,
            riskBand,
            snap.count,
            block.timestamp
        );
    }

    function getSnapshot(address user)
        external
        view
        returns (
            uint256 collateralRatioBps,
            uint256 liquidationPriceUsd,
            uint8 riskBand,
            string memory label,
            uint256 updatedAt,
            uint256 count
        )
    {
        Snapshot storage snap = _snapshots[user];
        return (
            snap.collateralRatioBps,
            snap.liquidationPriceUsd,
            snap.riskBand,
            snap.label,
            snap.updatedAt,
            snap.count
        );
    }

    function snapshotCount(address user) external view returns (uint256) {
        return _snapshots[user].count;
    }
}
