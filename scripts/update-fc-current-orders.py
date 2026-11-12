"""Regenerate current downstream customer order contracts and their materialized read routes."""
from pathlib import Path
import importlib.util

if __name__ == '__main__':
 path=Path(__file__).resolve().parent/'update-branch-customer-orders.py'
 spec=importlib.util.spec_from_file_location('branch_customer_orders',path)
 module=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(module)
 module.main()
