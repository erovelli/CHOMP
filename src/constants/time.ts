export const AVAILABLE_YEARS = ["2018", "2019", "2020", "2021", "2022", "2023", "2024"];
export const DEFAULT_YEAR = "2024";

// "All" + 12 months, shared by TimeControl and the mobile FilterSheet.
// Picking a month repaints the choropleth with monthly values (lazy-loads the
// monthly NDJSON on first use); null ("All") reverts to the annual view.
export const MONTH_OPTIONS: { value: string | null; label: string }[] = [
    { value: null, label: "All" },
    { value: "01", label: "Jan" },
    { value: "02", label: "Feb" },
    { value: "03", label: "Mar" },
    { value: "04", label: "Apr" },
    { value: "05", label: "May" },
    { value: "06", label: "Jun" },
    { value: "07", label: "Jul" },
    { value: "08", label: "Aug" },
    { value: "09", label: "Sep" },
    { value: "10", label: "Oct" },
    { value: "11", label: "Nov" },
    { value: "12", label: "Dec" },
];

export const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
