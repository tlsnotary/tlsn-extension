import React, { ReactElement } from 'react';
import RequestDetail from '../../components/RequestDetail';
import { useParams } from 'react-router';

export default function Request(): ReactElement {
  const params = useParams<{ requestId: string }>();

  return (
    <>{!!params.requestId && <RequestDetail requestId={params.requestId} />}</>
  );
}
