/**
 * @license
 * Copyright 2021 Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from "react";
import {ErrorPage, PageError, PureComponent, PureComponentProps, PureComponentState} from "../components";
import {Services} from "../services";
import {PageSection, PageSectionVariants, Spinner} from "@patternfly/react-core";

// TODO this should be configurable via standard UI config settings
const MAX_RETRIES: number = 5;

export enum PageErrorType {
    React, Server
}

/**
 * Properties
 */
// tslint:disable-next-line:no-empty-interface
export interface PageProps extends PureComponentProps {
}

/**
 * State
 */
// tslint:disable-next-line:no-empty-interface
export interface PageState extends PureComponentState {
    pageLoadRetries?: number;
    isLoading?: boolean;
    isError?: boolean;
    error?: PageError;
}


/**
 * The base class for all pages.
 */
export abstract class PageComponent<P extends PageProps, S extends PageState> extends PureComponent<P, S> {

    protected constructor(props: Readonly<P>) {
        super(props);
        setTimeout(() => {
            this.loadPageData();
        }, 10);
    }

    protected initializeState(): S {
        return {
            ...this.initializePageState(),
            isLoading: true
        };
    }

    protected abstract initializePageState(): S;

    protected history(): any {
        // @ts-ignore
        return this.props.history;
    }

    public componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        this.handleError(PageErrorType.React, error, errorInfo);
    }

    public render(): React.ReactElement {
        if (this.isError()) {
            return (
                <ErrorPage error={this.state.error}/>
            );
        } else if (this.state.isLoading) {
            return (
                <PageSection variant={PageSectionVariants.default} isFilled={true}>
                    <Spinner isSVG size="lg"/>
                    <span style={{marginLeft: "10px", fontSize: "large"}}>Loading, please wait...</span>
                </PageSection>
            );
        } else {
            return this.renderPage();
        }
    }

    /**
     * Renders the page content.  Subclasses should implement this instead of render() so that
     * errors are handled/displayed properly.
     */
    protected abstract renderPage(): React.ReactElement;

    protected postConstruct(): void {
        // @ts-ignore
        this.setHistory(this.props.history);
        super.postConstruct();
    }

    // @ts-ignore
    protected createLoaders(): Promise | Promise[] | null {
        return null;
    }

    protected handleServerError(error: any, errorMessage: string): void {
        this.handleError(PageErrorType.Server, error, errorMessage);
    }

    protected getPathParam(paramName: string): string {
        // @ts-ignore
        return decodeURIComponent(this.props.match.params[paramName]);
    }

    protected isLoading(): boolean {
        return this.state.isLoading ? true : false;
    }

    private loadPageData(): void {
        // @ts-ignore
        let loaders: Promise | Promise[] | null = this.createLoaders();
        if (loaders == null) {
            this.setSingleState("isLoading", false);
        } else {
            if (!Array.isArray(loaders)) {
                loaders = [ loaders ];
            }
            if (loaders.length === 0) {
                this.setSingleState("isLoading", false);
            } else {
                this.setSingleState("isLoading", true);
                Promise.all(loaders).then(() => {
                    this.setSingleState("isLoading", false);
                }).catch(error => {
                    Services.getLoggerService().debug("[PageComponent] Page data load failed, retrying.");
                    const retries: number = this.getRetries();
                    if (retries < MAX_RETRIES) {
                        this.incrementRetries();
                        setTimeout(() => {
                            this.loadPageData();
                        }, Math.pow(2, retries) * 100);
                    } else {
                        this.handleServerError(error, "Error loading page data.");
                    }
                });
            }
        }
    }

    private getRetries(): number {
        return this.state.pageLoadRetries !== undefined ? this.state.pageLoadRetries as number : 0;
    }

    private incrementRetries(): void {
        const retries: number = this.getRetries() + 1;
        this.setSingleState("pageLoadRetries", retries);
    }

    private isError(): boolean {
        return this.state.isError ? true : false;
    }

    private handleError(errorType: PageErrorType, error: any, errorMessage: any): void {
        Services.getLoggerService().error("[PageComponent] Handling an error of type: ", errorType);
        Services.getLoggerService().error("[PageComponent] ", errorMessage);
        Services.getLoggerService().error("[PageComponent] ", error);

        this.setMultiState({
            error: {
                error, errorMessage,
                type: errorType
            },
            isError: true
        });
    }
}

export abstract class TenantPageComponent<P extends PageProps, S extends PageState> extends PageComponent<P, S> {

    protected constructor(props: Readonly<P>) {
        super(props);
    }

    protected tenantId(): string {
        const tenantId: string = this.getPathParam("tenantId");
        return tenantId;
    }

    protected navPath(): string {
        const path: string = `/t/${this.tenantId()}`;
        return path;
    }

    protected federatedConfig(): any {
        const config: any = Services.getConfigService().registryConfig();
        const registryApi: string = (Services.getConfigService().registryApisUrl() + "/registry").replace(":tenantId", this.tenantId());
        if (config.artifacts) {
            config.artifacts.url = registryApi;
        }
        if (config.ui) {
            config.ui.navPrefixPath = this.navPath();
        }
        return config;
    }

}
