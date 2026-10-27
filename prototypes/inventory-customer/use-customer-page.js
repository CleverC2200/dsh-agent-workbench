/** The complete KPI/filter index stays separate from the visible table page. */
export function useCustomerPage(react, inventory, rows) {
  const codes = rows.map(row => row.code);
  const key = JSON.stringify(codes);
  const [page, setPage] = react.useState({key, owner: inventory, rows, loading: false});
  react.useEffect(() => {
    if (!inventory.readDetails) { setPage({key, owner: inventory, rows, loading: false}); return; }
    const controller = new AbortController();
    setPage({key, owner: inventory, rows: [], loading: true});
    inventory.readDetails(codes, {signal: controller.signal}).then(
      details => {
        if (controller.signal.aborted) return;
        const byCode = new Map(details.map(row => [row.code, row]));
        setPage({key, owner: inventory, rows: codes.map(code => byCode.get(code)).filter(Boolean), loading: false});
      },
      error => { if (!controller.signal.aborted) setPage({key, owner: inventory, rows: [], loading: false, error: error.code ?? error.message}); },
    );
    return () => controller.abort();
  }, [inventory, key]);
  return page.key===key&&page.owner===inventory?page:{rows:[],loading:true};
}
