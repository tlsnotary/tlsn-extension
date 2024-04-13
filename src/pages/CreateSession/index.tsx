import type {} from 'redux-thunk/extend-redux';
import React, { ReactElement, useEffect } from 'react';
import { connectSession } from '../../reducers/p2p';
import { useDispatch } from 'react-redux';
import ChatBox from '../../components/ChatBox';

export default function CreateSession(): ReactElement {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(connectSession());
  }, []);

  return <ChatBox />;
}
