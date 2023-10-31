import React, { ReactElement } from 'react';
import RequestDetail from '../../components/RequestDetail';
import { useParams } from 'react-router';
import { useRequest } from '../../reducers/requests';

export default function Request(): ReactElement {
  const params = useParams<{ requestId: string }>();

  return (
    <>
      <RequestDetail requestId={params.requestId} />
    </>
  );
}
