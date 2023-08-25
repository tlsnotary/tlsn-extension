import React, { ReactElement } from 'react';
import RequestTable from '../../components/RequestTable';
import { useRequests } from '../../reducers/requests';

export default function Requests(): ReactElement {
  const requests = useRequests();
  return (
    <>
      <RequestTable requests={requests} />
    </>
  );
}
