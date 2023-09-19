import React from 'react';
import { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function NavigateWithParams(props: {
  to: string;
}): ReactElement {
  const location = useLocation();
  return <Navigate to={location.pathname + props.to} />;
}
