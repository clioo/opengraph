# Product

## Register

product

## Users

Initially, a single developer who wants to express an agent workflow without writing code or wrestling with a general-purpose drawing tool. The product should later be understandable and useful to any developer designing model-assisted workflows.

## Product Purpose

Provide a free, ready-to-use visual canvas for composing graphs with draggable nodes, directed or bidirectional connections, loops, annotations, and explicit model and reasoning settings. Users maintain a small list of enabled models, choose global defaults, and let each node inherit those defaults or override them. The graph remains entirely in the browser, persists in local storage, and can be copied to the clipboard as a clean screenshot. Success means a developer can open the app and communicate a workflow visually within minutes, without an account, setup, or backend.

## Brand Personality

Precise, fast, and restrained. The product should feel ready to use, dependable, and quietly professional.

## Anti-references

Do not resemble a childish whiteboard, an ornate diagramming suite, a generic SaaS dashboard, or a control-dense enterprise tool. Avoid visual noise, decorative complexity, account prompts, onboarding walls, and panels that compete with the canvas.

## Design Principles

1. The canvas is the product: keep graph creation and manipulation at the center of every screen.
2. Ready means immediate: no login, setup wizard, backend, or mandatory configuration before drawing.
3. Reveal complexity only when it is useful: common actions stay obvious while advanced node settings remain close at hand.
4. Make the graph communicate itself: hierarchy, labels, model assignments, connection direction, and loops must remain legible without explanation.
5. Local by default: user work is private, resilient, and stored in the browser.

## Accessibility & Inclusion

Meet WCAG 2.1 AA. Model and state distinctions must never rely on color alone. Support keyboard focus, readable contrast, reduced motion, clear interaction targets, and both light and dark appearance.

## Optional Codex mode

OpenGraph can optionally be launched by a local MCP companion for voice- or chat-driven editing from Codex. The companion is a local STDIO process with a loopback-only HTTP/WebSocket session; it does not replace standalone mode, add an account, or send graph data to a hosted service. The browser remains the source of truth and local storage remains the persistence boundary.

Codex can read the graph, inspect the active selection, apply atomic changes with explicit model and reasoning settings, lay out the canvas, undo one confirmed transaction, and request the same PNG that the user can copy from the toolbar.
