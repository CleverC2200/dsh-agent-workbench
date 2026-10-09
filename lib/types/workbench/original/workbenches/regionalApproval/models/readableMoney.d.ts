/** Dashboard amounts are yuan; keep the unrounded value available in the title. */
export declare function readableMoney(input: string | number): {
    display: string;
    exact: string;
};
