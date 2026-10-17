import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { localWorkspaceRepository } from "./services/workspaceStorage";
import "./styles.css";
import "./design-system.css";
import "./nodus-tokens.css";
import "./nodus.css";
import "./builder/builder.css";

class ErrorBoundary extends React.Component<{children:React.ReactNode},{hasError:boolean}>{
  state={hasError:false};
  static getDerivedStateFromError(){return {hasError:true}}
  render(){if(this.state.hasError)return <main className="panel-page" role="alert"><h2>We couldn’t open this workspace.</h2><p>The saved workspace may be damaged. You can reset this browser’s demo data and start again.</p><button className="primary" onClick={()=>{localWorkspaceRepository.clear();window.location.reload()}}>Reset workspace</button></main>;return this.props.children}
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
