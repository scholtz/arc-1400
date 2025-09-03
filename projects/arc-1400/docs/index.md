# ARC-1400 Suite Documentation

This directory contains draft Algorand Request for Comments (ARC) specifications adapting the Ethereum ERC-1400 security token family to Algorand.

| File          | Title                          | Status | Summary                                                           |
| ------------- | ------------------------------ | ------ | ----------------------------------------------------------------- |
| `ARC-88.md`   | Ownable Access Control         | Draft  | Single-owner governance primitive (dependency for other modules). |
| `ARC-1400.md` | Security Token Standard Suite  | Draft  | Umbrella spec: composition, mappings, invariants.                 |
| `ARC-1594.md` | Core Security Token Operations | Draft  | Issuance, redemption, validation primitives.                      |
| `ARC-1410.md` | Partitioned Token Balances     | Draft  | Logical sub-ledgers (partitions) sharing total supply.            |
| `ARC-1643.md` | Document Registry              | Draft  | Standardized document metadata (URI + hash).                      |
| `ARC-1644.md` | Controller Operations          | Draft  | Forced transfer/redeem interface for regulated actions.           |

## Conventions

- Status values follow: Draft → Review → Final.
- All specs released under CC0 1.0.
- ABI method names are recommendations; implementers MUST preserve semantics.

## Next Steps

- Incorporate community feedback.
- Provide reference TEAL / TypeScript implementations.
- Add conformance test suite.

## License

CC0 1.0 Universal.
