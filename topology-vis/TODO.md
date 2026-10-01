I'd like a browser-based visualization tool for our DC topology, routing, and traffic. It should be dynamic and interactive. JavaScript is a possible implementation choice.

Rules:
- Describe and configure the model in a YAML file.
- Divide the work into steps and commit after each step.

Show:
- The physical topology.
- BGP peerings, including peerings with route servers.
- Customer and infrastructure VMs, including route servers.
- Which routes are advertised, by whom, and to which peers.
- Host and VM route tables, available by clicking the host or VM.
- The flow of route advertisements.
- Traffic between VMs and between devices, including BGP control traffic.
- Traffic moving along the relevant session or link lines.
- Underlay and overlay components.
- Clickable links and BGP sessions, with AFIs, IP addresses, and routes.

Visualization controls:
- Show one icon per RS cluster.
- Show physical links.
- Show BGP peerings.
- Show RSs separately from their hosting machines.
- Set the number of spines (S).
- Set the number of bolts (B).
- Set the number of racks per bolt (R).
- Set the number of servers per rack (H).
- Set the total number of customer VMs (V), distributed across hosts.

Original DC hierarchy (later defaults are recorded in DECISIONS.md):

- 4 borders.
- 4 stems.
- 8 spines, with support for more.
- B bolts, each with 4 leaves. A group of four leaves is called a bolt in Akamai terminology.
- R racks per bolt, each with 2 ToRs.
- H servers per rack.
- VMs hosted on servers.

BGP peerings:
- Host ↔ ToR: BGP unnumbered.
- Host ↔ RS Bolt: BGP over IPv6.
- RS Bolt ↔ RS Ctrl: BGP over IPv6.
- RS Ctrl ↔ RS User: BGP over IPv6.

Each DC has:
- 4 RS User VMs.
- 4 RS Ctrl VMs.
- 4 RS Bolt VMs per bolt.

Original address examples, superseded by the synthetic scheme in DECISIONS.md:
- RS Bolt: `2600:<bolt id>:F::<id>`.
- RS Ctrl: `2600:F::<id>`.
- RS User: `2600:F1::<id>`.
- Host: `2600:<bolt id>::<host id>`.

Host labels concatenate `h`, the bolt ID, and the host ID padded to three digits: `h2003`, `h13045`, `h20999`.

The complete BGP overlay relationships are recorded in DECISIONS.md.
