require 'lib/spec_helper'
require 'sourcemap'
require 'rack/test'

describe Opal::Server do
  include Rack::Test::Methods

  def app
    described_class.new { |s|
      s.main = 'opal'
      s.debug = false
      s.append_path File.expand_path('../../fixtures', __FILE__)
      s.sprockets.logger = Logger.new(STDOUT)
    }
  end

  it 'serves assets from /assets' do
    get '/assets/opal.js'
    expect(last_response).to be_ok
  end

  describe 'source maps' do
    it 'serves map on a top level file' do
      get '/assets/source_map.js'
      expect(last_response).to be_ok

      get '/assets-maps/source_map.map'
      expect(last_response).to be_ok
    end

    it 'serves map on a subfolder file' do
      js_path = '/assets/source_map/subfolder/other_file.js'
      map_path = '/assets-maps/source_map/subfolder/other_file.map'

      get js_path

      expect(last_response).to be_ok
      received_map_path = extract_map_path(last_response)
      expect(expand_path(received_map_path, js_path+'/..')).to eq(map_path)

      get '/assets-maps/source_map/subfolder/other_file.map'
      expect(last_response).to be_ok
    end

    it 'serves map on a subfolder file' do
      js_path = '/assets/source_map/subfolder/other_file.js'
      map_path = '/assets-maps/source_map/subfolder/other_file.map'

      get js_path

      expect(last_response).to be_ok
      received_map_path = extract_map_path(last_response)
      expect(expand_path(received_map_path, js_path+'/..')).to eq(map_path)


      get '/assets-maps/source_map/subfolder/other_file.map'
      expect(last_response).to be_ok
      map = ::SourceMap::Map.from_json(last_response.body)
      expect(map.sources).to include('/assets-maps/source_map/subfolder/other_file.rb')
    end
  end

  def extract_map_path(response)
    source_map_comment_regexp = %r{//# sourceMappingURL=(.*)$}

    case
    when response.body =~ source_map_comment_regexp
      p :body
      body.scan(source_map_comment_regexp).first.first
    when response.headers['X-SourceMap']
      p :header
      response.headers['X-SourceMap']
    else
      raise "cannot find source map in response: #{response.inspect}"
    end
  end

  def expand_path(file_name, dir_string)
    path = File.expand_path(file_name, dir_string)
    # Remove Windows letter and colon (eg. C:) from path
    path = path[2..-1] if !(RUBY_PLATFORM =~ /mswin|mingw/).nil?
    path
  end
end
