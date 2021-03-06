--
-- (C) 2020 - ntop.org
--
local dirs = ntop.getDirs()
package.path = dirs.installdir .. "/scripts/lua/modules/?.lua;" .. package.path
package.path = dirs.installdir .. "/scripts/lua/modules/pools/?.lua;" .. package.path
package.path = dirs.installdir .. "/scripts/lua/modules/recipients/?.lua;" .. package.path

require "lua_utils"
local page_utils = require "page_utils"
local json = require "dkjson"
local template_utils = require "template_utils"

local host_pools              = require "host_pools"
local flow_pools              = require "flow_pools"
local system_pools            = require "system_pools"
local device_pools            = require "mac_pools"
local interface_pools         = require "interface_pools"
local host_pool_pools         = require "host_pool_pools"
local local_network_pools     = require "local_network_pools"
local active_monitoring_pools = require "active_monitoring_pools"

local snmp_device_pools
-- load the snmp module only in the pro version
if ntop.isPro() then
   snmp_device_pools = require "snmp_device_pools"
end

local recipients = require "recipients"
local recipients_instance = recipients:create()

-- *************** end of requires ***************

local is_nedge = ntop.isnEdge()
-- select the default page
local page = _GET["page"] or (is_nedge and "active_monitoring" or "host")

sendHTTPContentTypeHeader('text/html')

if not haveAdminPrivileges() then return end
page_utils.set_active_menu_entry(page_utils.menu_entries.manage_pools)

-- append the menu above the page
dofile(dirs.installdir .. "/scripts/lua/inc/menu.lua")

-- if the selected page is snmp but we aren't in pro version
-- then block the user with an alert
if page == "snmp" and not ntop.isPro() then
   dofile(dirs.installdir .. "/scripts/lua/inc/footer.lua")
   return
end

page_utils.print_page_title(i18n("pools.pools"))

-- ************************************* ------

local pool_types = {

   -- Normal Pools
   ["interface"] = interface_pools,
   ["network"] = local_network_pools,
   ["active_monitoring"] = active_monitoring_pools,
   ["snmp"] = snmp_device_pools,
   ["host"] = host_pools,

   -- Default Only Pools
   ["host_pool"] = host_pool_pools,
   ["flow"] = flow_pools,
   ["system"] = system_pools,
   ["mac"] = device_pools
}

local pool_instance = pool_types[page]:create()
local pool_type = (page == "snmp" and "snmp/device" or page)

local menu = {
   entries = {

      -- Normal Pools
      { key = "host", title = i18n("pools.pool_names.host"), url = "?page=host", hidden = is_nedge},
      { key = "interface", title = i18n("pools.pool_names.interface"), url = "?page=interface", hidden = is_nedge},
      { key = "network", title = i18n("pools.pool_names.local_network"), url = "?page=network", hidden = false},
      { key = "snmp", title = i18n("pools.pool_names.snmp"), url = "?page=snmp", hidden = (not ntop.isPro() or is_nedge)},
      { key = "active_monitoring", title = i18n("pools.pool_names.active_monitoring"), url = "?page=active_monitoring", hidden = false },

   -- Default Only Pools
      { key = "host_pool", title = i18n("pools.pool_names.host_pool_pool"), url = "?page=host_pool", hidden = false},
      { key = "flow", title = i18n("pools.pool_names.flows"), url = "?page=flow", hidden = false},
      { key = "mac", title = i18n("pools.pool_names.devices"), url = "?page=mac", hidden = false},
      { key = "system", title = i18n("pools.pool_names.system"), url = "?page=system", hidden = false}
   },
   current_page = page
}

local context = {
    template_utils = template_utils,
    json = json,
    menu = menu,
    pool = {
        name = page,
        instance = pool_instance,
        all_members = pool_instance:get_all_members(),
        configsets = pool_instance:get_available_configset_ids(),
        assigned_members = pool_instance:get_assigned_members(),
        endpoints = {
            get_all_pools  = string.format("/lua/rest/v1/get/%s/pools.lua", pool_type),
            add_pool       = string.format("/lua/rest/v1/add/%s/pool.lua", pool_type),
            edit_pool      = string.format("/lua/rest/v1/edit/%s/pool.lua", pool_type),
            delete_pool    = string.format("/lua/rest/v1/delete/%s/pool.lua", pool_type),
        },
        notification_recipients = recipients_instance:get_all_recipients()
    }
}

print(template_utils.gen("pages/table_pools.template", context))

-- ************************************* ------

-- append the menu down below the page
dofile(dirs.installdir .. "/scripts/lua/inc/footer.lua")
