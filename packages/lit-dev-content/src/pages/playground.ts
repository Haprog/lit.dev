/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import '@material/mwc-button';
import '@material/mwc-snackbar';
import 'playground-elements/playground-ide.js';

import Tar from 'tarts';
import {Snackbar} from '@material/mwc-snackbar';

window.addEventListener('DOMContentLoaded', () => {
  /**
   * Encode the given string to base64url, with support for all UTF-16 code
   * points, and '=' padding omitted.
   *
   * Built-in btoa throws on non-latin code points (>0xFF), so this function
   * first converts the input to a binary UTF-8 string.
   *
   * Outputs base64url (https://tools.ietf.org/html/rfc4648#section-5), where
   * '+' and '/' are replaced with '-' and '_' respectively, so that '+' doesn't
   * need to be percent-encoded (since it would otherwise be mis-interpreted as
   * a space).
   *
   * TODO(aomarks) Make this a method on <playground-project>? It's likely to be
   * needed by other projects too.
   */
  const encodeSafeBase64 = (str: string) => {
    // Adapted from suggestions in https://stackoverflow.com/a/30106551
    //
    // Example:
    //
    //   [1] Given UTF-16 input: "😃" {D83D DE03}
    //   [2] Convert to UTF-8 escape sequences: "%F0%9F%98%83"
    //   [3] Extract UTF-8 code points, and re-interpret as UTF-16 code points,
    //       creating a string where all code points are <= 0xFF and hence safe
    //       to base64 encode: {F0 9F 98 83}
    const percentEscaped = encodeURIComponent(str);
    const utf8 = percentEscaped.replace(/%([0-9A-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    const base64 = btoa(utf8);
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_');
    // Padding is confirmed optional on Chrome 88, Firefox 85, and Safari 14.
    const padIdx = base64url.indexOf('=');
    return padIdx >= 0 ? base64url.slice(0, padIdx) : base64url;
  };

  const decodeSafeBase64 = (base64url: string) => {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const utf8 = atob(base64);
    const percentEscaped = utf8
      .split('')
      .map((char) => '%' + char.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('');
    const str = decodeURIComponent(percentEscaped);
    return str;
  };

  const $ = document.body.querySelector.bind(document.body);
  const project = $('playground-project')!;

  const shareButton = $('#shareButton')!;
  const shareSnackbar = $('#shareSnackbar')! as Snackbar;
  shareButton.addEventListener('click', async () => {
    // No need to include contentType (inferred) or undefined label (unused).
    const files = Object.entries(project.config?.files ?? {}).map(
      ([name, file]) => ({
        name,
        content: file.content,
      })
    );
    const base64 = encodeSafeBase64(JSON.stringify(files));
    window.location.hash = '#project=' + base64;
    await navigator.clipboard.writeText(window.location.toString());
    shareSnackbar.open = true;
  });

  const downloadButton = $('#downloadButton')!;
  downloadButton.addEventListener('click', () => {
    const tarFiles = Object.entries(project.config?.files ?? {}).map(
      ([name, {content}]) => ({
        name,
        content: content ?? '',
      })
    );
    const tar = Tar(tarFiles);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([tar], {type: 'application/tar'}));
    a.download = 'lit-playground.tar';
    a.click();
  });

  const syncStateFromUrlHash = async () => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.slice(1));

    let urlFiles: Array<{name: string; content: string}> | undefined;
    const base64 = params.get('project');
    if (base64) {
      try {
        const json = decodeSafeBase64(base64);
        try {
          urlFiles = JSON.parse(json);
        } catch {
          console.error('Invalid JSON in URL', JSON.stringify(json));
        }
      } catch {
        console.error('Invalid project base64 in URL');
      }
    }

    $('.exampleItem.active')?.classList.remove('active');

    if (urlFiles) {
      // TODO(aomarks) We really need a second origin now that it is trivial for
      // somebody to share a link that executes arbitrary code.
      // https://github.com/PolymerLabs/lit.dev/issues/26
      project.config = {
        extends: '/samples/base.json',
        files: Object.fromEntries(
          urlFiles.map(({name, content}) => [name, {content}])
        ),
      };
    } else {
      let sample = 'examples/hello-world-typescript';
      const urlSample = params.get('sample');
      if (urlSample?.match(/^[a-zA-Z0-9_\-\/]+$/)) {
        sample = urlSample;
      }
      project.projectSrc = `/samples/${sample}/project.json`;

      const link = $(`.exampleItem[data-sample="${sample}"]`);
      if (link) {
        link.classList.add('active');
        // Wait for the drawer to upgrade and render before scrolling.
        await customElements.whenDefined('litdev-drawer');
        requestAnimationFrame(() => {
          link.scrollIntoView({behavior: 'smooth', block: 'nearest'});
        });
      }
    }
  };

  syncStateFromUrlHash();
  window.addEventListener('hashchange', syncStateFromUrlHash);
});