package dctopology

import (
	"encoding/binary"
	"net/netip"
)

type AddressingConfig struct {
	IPv6 IPv6Config `yaml:"ipv6,omitempty" json:"ipv6,omitempty"`
}

// Each role owns a /48; the remaining bits hold scope, entity and suffix.
// Empty fields preserve the original documentation-only addressing scheme.
type IPv6Config struct {
	FabricPrefix   string  `yaml:"fabric_prefix,omitempty" json:"fabric_prefix,omitempty"`
	HostPrefix     string  `yaml:"host_prefix,omitempty" json:"host_prefix,omitempty"`
	RSBoltPrefix   string  `yaml:"rs_bolt_prefix,omitempty" json:"rs_bolt_prefix,omitempty"`
	RSCtrlPrefix   string  `yaml:"rs_ctrl_prefix,omitempty" json:"rs_ctrl_prefix,omitempty"`
	RSUserPrefix   string  `yaml:"rs_user_prefix,omitempty" json:"rs_user_prefix,omitempty"`
	CustomerPrefix string  `yaml:"customer_prefix,omitempty" json:"customer_prefix,omitempty"`
	Suffix         *uint32 `yaml:"suffix,omitempty" json:"suffix,omitempty"`
}

type ipv6Pool struct {
	key    string
	prefix string
}

func (s IPv6Config) pools() []ipv6Pool {
	pools := []ipv6Pool{
		{"fabric_prefix", s.FabricPrefix}, {"host_prefix", s.HostPrefix},
		{"rs_bolt_prefix", s.RSBoltPrefix}, {"rs_ctrl_prefix", s.RSCtrlPrefix},
		{"rs_user_prefix", s.RSUserPrefix}, {"customer_prefix", s.CustomerPrefix},
	}
	defaults := []string{"2001:db8:1::/48", "2001:db8:2::/48", "2001:db8:3::/48", "2001:db8:4::/48", "2001:db8:5::/48", "2001:db8:6::/48"}
	for i := range pools {
		if pools[i].prefix == "" {
			pools[i].prefix = defaults[i]
		}
	}
	return pools
}

func (s IPv6Config) validate(add func(string, string)) bool {
	valid := true
	seen := map[netip.Prefix]string{}
	global := netip.MustParsePrefix("2000::/3")
	ula := netip.MustParsePrefix("fc00::/7")
	for _, pool := range s.pools() {
		path := "addressing.ipv6." + pool.key
		prefix, err := netip.ParsePrefix(pool.prefix)
		if err != nil || !prefix.Addr().Is6() || prefix.Bits() != 48 || prefix != prefix.Masked() || (!global.Contains(prefix.Addr()) && !ula.Contains(prefix.Addr())) {
			add(path, "podaj wyrównany prefiks IPv6 /48 z przestrzeni globalnej lub ULA")
			valid = false
			continue
		}
		if previous, exists := seen[prefix]; exists {
			add(path, "pula pokrywa się z addressing.ipv6."+previous)
			valid = false
		}
		seen[prefix] = pool.key
	}
	return valid
}

// Call after configuration validation. Scope is a bolt ID or zero for DC-wide roles.
func (s IPv6Config) identity(role, scope uint16, entity uint32) netip.Addr {
	prefix := netip.MustParsePrefix(s.pools()[role-1].prefix)
	raw := prefix.Addr().As16()
	binary.BigEndian.PutUint16(raw[6:8], scope)
	binary.BigEndian.PutUint32(raw[8:12], entity)
	suffix := uint32(1)
	if s.Suffix != nil {
		suffix = *s.Suffix
	}
	binary.BigEndian.PutUint32(raw[12:16], suffix)
	return netip.AddrFrom16(raw)
}

func (s IPv6Config) customerAddressAllowed(address netip.Addr) bool {
	prefix := netip.MustParsePrefix(s.pools()[5].prefix)
	return documentationV6.Contains(address) || prefix.Contains(address)
}
