import { combineReducers } from "redux";
import requests from "./requests";

const rootReducer = combineReducers({
  requests,
});

export type AppRootState = ReturnType<typeof rootReducer>;
export default rootReducer;
