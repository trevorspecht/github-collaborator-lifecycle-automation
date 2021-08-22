# This Ruby script would be used to generate a JSON Web Token  
# given a downloaded Github App private key pem file.
# This is not currently being used but keeping here for reference in case needed.

require 'openssl'
require 'jwt'  # https://rubygems.org/gems/jwt

# Private key contents
private_pem = File.read('/Users/trevorspecht/Downloads/cls.2021-05-04.private-key.pem')
private_key = OpenSSL::PKey::RSA.new(private_pem)

# Generate the JWT
payload = {
  # issued at time, 60 seconds in the past to allow for clock drift
  iat: Time.now.to_i - 60,
  # JWT expiration time (10 minute maximum)
  exp: Time.now.to_i + (10 * 60),
  # GitHub App's identifier
  iss: 102441
}

jwt = JWT.encode(payload, private_key, "RS256")
puts jwt