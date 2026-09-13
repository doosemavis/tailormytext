# A Normal Markdown Document

This is a real Markdown file. The sniffer should NOT upgrade it to anything else, since the extension already matches the content.

The point of this fixture is verifying the no-op case: a correctly-extensioned text file goes through unchanged. If the sniffer started flipping correctly-typed files unnecessarily, this would surface as drift.

## Some Heading

A paragraph with **bold** and a [link](url).
