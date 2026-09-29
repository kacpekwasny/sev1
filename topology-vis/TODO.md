
I'd like to create a visualization tool for our DC topology and all the routing and traffic that goes on inside.
It should be for web browser, all dynamic, clickable, probably all written in JS (but i don't know).

Rules:
- there has to be a yaml file that is used for configuring/describing everything
- divide the work into steps, commit after each step

I'd like to show:
- physical topology
- bgp peerings
- customer VMs
- infrastructure VMs (like route servers)
- bgp peerings to the route servers
- what routes are being advertised from where to where
- route tables on hosts - inspecting after clicking on the host
- route tables on VMs - inspecting after clicking on the VM
- flow of advertised routes
- flow of traffic between vms
- flow of traffic between devices (like control traffic - BGP)
- the traffic to be shown as a flow, on the lines of the session / links
- parts of the underlay
- parts of the overlay
- click to inspect links,
- click to inspect bgp sessions
    - AFIs, IPs, routes

Switches for controlling the visualization:
- show just one RS per RS cluster
- show physical links
- show bgp peerings
- show RSs abstracted from the hosts they live on
- S - spines
- B - bolts
- R - racks per bolt
- S - servers per rack
- V - number of vms in the whole DC distributed across the servers/hosts



Our DC looks like this:

4x border
4x stem
8x spine (can be more)
Bx 4x leaf (4 leafs make a bolt in akamai terminology; B is number of bolts in a DC)
Rx 2x tor (2 tors per rack; T is number of tors in a bolt)
Sx server (number of servers in a rack)
VMs in a server

BGP peerings:
- host - tor via bgp unnumbered
- host - RS Bolt via bgp v6
- RS bolt - RS Ctrl v6
- RS Ctrl - RS User v6

One DC has:
- 4x RS User per DC
- 4x RS Ctrl per DC
- Bx 4x RS Bolt per DC

RS addresses:
- RS Bolt: 2600:<bolt id>:F::<id>
- RS ctrl: 2600:F::<id>
- RS ctrl: 2600:F1::<id>


Hosts have addresses
- 2600:<bolt id>::<host id>
hosta have labels: 
- h<bolt id><host id (width 3)> = h2003, h13045, h20999

The bgp overlay topology is 


