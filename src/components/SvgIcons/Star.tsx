import React from 'react';

export default function Star({ isStarred }: { isStarred: boolean }) {
  return (
    <svg
      width="14"
      height="15"
      viewBox="0 0 14 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6.36606 1.95134C6.56606 1.33734 7.43473 1.33734 7.63406 1.95134L8.64673 5.06734C8.69031 5.201 8.77503 5.31746 8.88878 5.40008C9.00253 5.4827 9.13948 5.52724 9.28006 5.52734H12.5567C13.2027 5.52734 13.4707 6.35401 12.9487 6.73401L10.2981 8.65934C10.1842 8.74212 10.0995 8.85881 10.056 8.9927C10.0125 9.12659 10.0125 9.2708 10.0561 9.40468L11.0681 12.5207C11.2681 13.1353 10.5647 13.646 10.0427 13.266L7.39206 11.3407C7.27814 11.2579 7.14091 11.2133 7.00006 11.2133C6.85922 11.2133 6.72199 11.2579 6.60806 11.3407L3.9574 13.266C3.4354 13.646 2.73206 13.1347 2.93206 12.5207L3.94406 9.40468C3.98758 9.2708 3.98761 9.12659 3.94414 8.9927C3.90066 8.85881 3.81593 8.74212 3.70206 8.65934L1.0514 6.73401C0.52873 6.35401 0.798064 5.52734 1.4434 5.52734H4.7194C4.8601 5.52738 4.9972 5.4829 5.11108 5.40028C5.22496 5.31765 5.30978 5.20111 5.3534 5.06734L6.36606 1.95134Z"
        stroke="#4B5563"
        fill={isStarred ? '#4B5563' : ''}
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
