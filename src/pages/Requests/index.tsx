import React, { ReactElement } from 'react';
import RequestTable from '../../components/RequestTable';
import { useUniqueRequests } from '../../reducers/requests';
import { useState, useEffect } from 'react';
import { RequestLog } from '../../entries/Background/rpc';

export default function Requests(): ReactElement {
  const requests = useUniqueRequests();

  console.log('requests', requests);

  return (
    <>
      <RequestTable requests={requests} />
    </>
  );
}
