import React, { ReactElement } from 'react';
import RequestTable from '../../components/RequestTable';
import { useRequests } from '../../reducers/requests';

export default function Requests(props: { shouldFix?: boolean }): ReactElement {
  const requests = useRequests();
  return (
    <>
      <RequestTable shouldFix={props.shouldFix} requests={requests} />
    </>
  );
}
