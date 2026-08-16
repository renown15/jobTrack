"""Providers facade importing existing provider implementations."""

# Re-export existing providers module under the new package layout
try:
    from jobtrack_navigator_ai import providers as _legacy_providers

    # Re-export commonly used names
    globals().update(
        {k: v for k, v in vars(_legacy_providers).items() if not k.startswith("_")}
    )
except Exception:
    # Keep a minimal fallback to avoid ImportError during early refactor steps
    pass
