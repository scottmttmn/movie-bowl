// A generic laurel, drawn here: the Best Picture packs describe the award, but
// the Academy's statuette is its trademark and is not used.
export default function LaurelWreath({ className = "" }) {
  const half = (
    <>
      <path d="M31 50 C 16 46, 8 34, 10 12" stroke="#eab308" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="24" cy="47" rx="5" ry="2.3" fill="#facc15" transform="rotate(-25 24 47)" />
      <ellipse cx="17" cy="41" rx="5" ry="2.3" fill="#facc15" transform="rotate(-45 17 41)" />
      <ellipse cx="12" cy="33" rx="5" ry="2.3" fill="#facc15" transform="rotate(-65 12 33)" />
      <ellipse cx="10" cy="24" rx="5" ry="2.3" fill="#facc15" transform="rotate(-85 10 24)" />
      <ellipse cx="11" cy="15" rx="4.5" ry="2.1" fill="#facc15" transform="rotate(-105 11 15)" />
      <ellipse cx="18" cy="37" rx="4.5" ry="2" fill="#ca8a04" transform="rotate(20 18 37)" />
      <ellipse cx="14" cy="27" rx="4.5" ry="2" fill="#ca8a04" transform="rotate(5 14 27)" />
      <ellipse cx="14" cy="18" rx="4" ry="1.8" fill="#ca8a04" transform="rotate(-10 14 18)" />
    </>
  );
  return (
    <svg viewBox="0 0 70 54" fill="none" aria-hidden="true" className={className}>
      <g>{half}</g>
      <g transform="translate(70 0) scale(-1 1)">{half}</g>
    </svg>
  );
}
